import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  helpdeskApi,
  mapApiCategory,
  mapApiCategories,
  mapApiTicket,
  mapApiTickets,
  type HelpdeskTicketCreateBody,
} from "@/domains/helpdesk";
import { pageItems, useApiRouteEnabled, withApiFallback, type ApiRecord } from "@/shared/api";
import { queryKeys, queryTimings } from "@/shared/query";
import { useEmployees } from "@/lib/employees-store";
import {
  TICKETS as SEED_TICKETS,
  CATEGORIES as SEED_CATEGORIES,
  type Ticket,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type TicketComment,
  type TicketEvent,
  type TicketAttachment,
  type CategoryConfig,
} from "./mock/helpdesk";

const T_KEY = "hawkaii_tickets_v1";
const C_KEY = "hawkaii_helpdesk_categories_v1";

const ls = {
  get<T>(k: string, fb: T): T {
    if (typeof window === "undefined") return fb;
    try {
      const r = window.localStorage.getItem(k);
      return r ? (JSON.parse(r) as T) : fb;
    } catch {
      return fb;
    }
  },
  set(k: string, v: unknown) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(k, JSON.stringify(v));
  },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();
const evt = (actor: string, action: string, detail?: string): TicketEvent => ({
  id: "e_" + uid(),
  at: now(),
  actor,
  action,
  detail,
});

export interface NewTicketInput {
  subject: string;
  description: string;
  category: TicketCategory;
  subCategory: string;
  priority: TicketPriority;
  raisedBy: string;
  raisedByEmail?: string;
  raisedByDept?: string;
  relatedAssetId?: string;
  relatedProjectId?: string;
  attachmentName?: string;
}

interface Ctx {
  tickets: Ticket[];
  categories: CategoryConfig[];
  loading: boolean;
  error: Error | null;
  isApiBacked: boolean;
  createTicket: (input: NewTicketInput) => Ticket | Promise<Ticket>;
  addComment: (
    id: string,
    body: string,
    author: string,
    authorRole?: string,
    internal?: boolean,
  ) => void | Promise<void>;
  addAttachment: (
    id: string,
    name: string,
    by: string,
    documentId?: string,
    sizeText?: string,
  ) => void | Promise<void>;
  changePriority: (id: string, priority: TicketPriority, actor: string) => void | Promise<void>;
  assign: (
    id: string,
    assignee: string,
    assigneeRole: string | undefined,
    actor: string,
  ) => void | Promise<void>;
  setStatus: (
    id: string,
    status: TicketStatus,
    actor: string,
    note?: string,
  ) => void | Promise<void>;
  resolve: (id: string, resolution: string, actor: string) => void | Promise<void>;
  close: (id: string, actor: string) => void | Promise<void>;
  reopen: (id: string, reason: string, actor: string) => void | Promise<void>;
  escalate: (id: string, reason: string, actor: string) => void | Promise<void>;
  upsertCategory: (c: CategoryConfig) => void | Promise<void>;
  toggleCategory: (key: string, active: boolean) => void | Promise<void>;
  reset: () => void;
}

const Ctx_ = React.createContext<Ctx | null>(null);

export function HelpdeskProvider({ children }: { children: React.ReactNode }) {
  const [tickets, setTickets] = React.useState<Ticket[]>(SEED_TICKETS);
  const [categories, setCategories] = React.useState<CategoryConfig[]>(SEED_CATEGORIES);
  const { employees } = useEmployees();
  const queryClient = useQueryClient();
  const apiEnabled = useApiRouteEnabled(["/helpdesk", "/reports/helpdesk"]);

  React.useEffect(() => {
    setTickets(ls.get(T_KEY, SEED_TICKETS));
    setCategories(ls.get(C_KEY, SEED_CATEGORIES));
  }, []);

  const persistT = (next: Ticket[]) => {
    setTickets(next);
    ls.set(T_KEY, next);
  };
  const persistC = (next: CategoryConfig[]) => {
    setCategories(next);
    ls.set(C_KEY, next);
  };

  const apiTicketsQuery = useQuery({
    queryKey: queryKeys.list("helpdesk", "tickets", { page_size: 100 }),
    queryFn: () =>
      withApiFallback(
        async () => mapApiTickets(pageItems(await helpdeskApi.list({ page_size: 100 })), tickets),
        () => tickets,
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.listStaleMs,
  });

  const apiCategoriesQuery = useQuery({
    queryKey: queryKeys.list("helpdesk", "categories", { active_only: false }),
    queryFn: () =>
      withApiFallback(
        async () => {
          const response = await helpdeskApi.categories({ active_only: false });
          const items = Array.isArray((response as ApiRecord).categories)
            ? ((response as ApiRecord).categories as unknown[])
            : [];
          return mapApiCategories(items, categories);
        },
        () => categories,
      ),
    enabled: apiEnabled,
    staleTime: queryTimings.referenceStaleMs,
  });

  const visibleTickets = apiEnabled ? (apiTicketsQuery.data ?? []) : tickets;
  const visibleCategories = apiEnabled ? (apiCategoriesQuery.data ?? []) : categories;
  const apiError =
    (apiTicketsQuery.error instanceof Error && apiTicketsQuery.error) ||
    (apiCategoriesQuery.error instanceof Error && apiCategoriesQuery.error) ||
    null;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.domain("helpdesk") });
  };

  const findTicket = (id: string) =>
    visibleTickets.find((ticket) => ticket.id === id || ticket.apiId === id);

  const expectedVersion = (id: string) => findTicket(id)?.version ?? 1;
  const apiTicketId = (id: string) => findTicket(id)?.apiId ?? id;

  const resolveEmployeeUserId = (name: string): string => {
    const employee = employees.find(
      (candidate) =>
        candidate.name === name ||
        candidate.email === name ||
        candidate.id === name ||
        candidate.apiId === name,
    );
    if (!employee?.apiId) {
      throw new Error(`${name} must be selected from backend employees before assignment.`);
    }
    return employee.apiId;
  };

  const update = (id: string, mut: (t: Ticket) => Ticket) => {
    persistT(tickets.map((t) => (t.id === id ? { ...mut(t), updatedAt: now() } : t)));
  };

  const localCreateTicket: Ctx["createTicket"] = (input) => {
    const cfg = categories.find((c) => c.key === input.category);
    const max = tickets.reduce((m, t) => {
      const n = parseInt(t.id.replace(/\D/g, ""), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 12000);
    const id = `TKT-${max + 1}`;
    const at = now();
    const attachments: TicketAttachment[] = input.attachmentName
      ? [{ id: "f_" + uid(), name: input.attachmentName, size: "—", by: input.raisedBy, at }]
      : [];
    const t: Ticket = {
      id,
      subject: input.subject,
      description: input.description,
      category: input.category,
      subCategory: input.subCategory,
      priority: input.priority,
      status: cfg?.defaultAssignee ? "assigned" : "new",
      raisedBy: input.raisedBy,
      raisedByEmail: input.raisedByEmail,
      raisedByDept: input.raisedByDept,
      assignee: cfg?.defaultAssignee,
      assigneeRole: cfg?.defaultAssigneeRole,
      createdAt: at,
      updatedAt: at,
      relatedAssetId: input.relatedAssetId,
      relatedProjectId: input.relatedProjectId,
      reopenCount: 0,
      escalated: false,
      comments: [],
      attachments,
      events: [
        { id: "e_" + uid(), at, actor: input.raisedBy, action: "Ticket created" },
        ...(cfg?.defaultAssignee
          ? [
              {
                id: "e_" + uid(),
                at,
                actor: "System",
                action: `Auto-assigned to ${cfg.defaultAssignee}`,
              },
            ]
          : []),
      ],
    };
    persistT([t, ...tickets]);
    return t;
  };

  const createTicket: Ctx["createTicket"] = async (input) => {
    if (!apiEnabled) return localCreateTicket(input);
    const cfg = visibleCategories.find((category) => category.key === input.category);
    const body: HelpdeskTicketCreateBody = {
      category_id: cfg?.apiId,
      category_key: cfg?.apiId ? undefined : input.category,
      subject: input.subject,
      description: input.description,
      sub_category: input.subCategory,
      priority: input.priority,
      attachment_name: input.attachmentName,
      related_asset_id: input.relatedAssetId,
      related_project_id: input.relatedProjectId,
    };
    const response = await helpdeskApi.create(body);
    await invalidate();
    return mapApiTicket((response as ApiRecord).ticket);
  };

  const addComment: Ctx["addComment"] = async (id, body, author, authorRole, internal) => {
    if (apiEnabled) {
      const input = { message: body, expected_version: expectedVersion(id) };
      if (internal) await helpdeskApi.addInternalNote(apiTicketId(id), input);
      else await helpdeskApi.addComment(apiTicketId(id), input);
      await invalidate();
      return;
    }
    update(id, (t) => {
      const isFirstResponse = !t.firstResponseAt && author !== t.raisedBy;
      const c: TicketComment = { id: "c_" + uid(), at: now(), author, authorRole, body, internal };
      return {
        ...t,
        comments: [...t.comments, c],
        firstResponseAt: isFirstResponse ? now() : t.firstResponseAt,
        events: [...t.events, evt(author, internal ? "Internal note added" : "Comment added")],
      };
    });
  };

  const addAttachment: Ctx["addAttachment"] = async (id, name, by, documentId, sizeText) => {
    if (apiEnabled) {
      await helpdeskApi.addAttachment(apiTicketId(id), {
        document_id: documentId,
        file_name: name,
        size_text: sizeText,
        attachment_type: "supporting_document",
        expected_version: expectedVersion(id),
      });
      await invalidate();
      return;
    }
    update(id, (t) => ({
      ...t,
      attachments: [
        ...t.attachments,
        {
          id: "f_" + uid(),
          documentId,
          name,
          size: sizeText ?? "—",
          by,
          at: now(),
        },
      ],
      events: [...t.events, evt(by, "Attachment uploaded", name)],
    }));
  };

  const changePriority: Ctx["changePriority"] = async (id, priority, actor) => {
    if (apiEnabled) {
      await helpdeskApi.changePriority(apiTicketId(id), {
        priority,
        remarks: priority === "Urgent" ? "Escalated from frontend action" : undefined,
        expected_version: expectedVersion(id),
      });
      await invalidate();
      return;
    }
    update(id, (t) => ({
      ...t,
      priority,
      events: [...t.events, evt(actor, "Priority changed", `→ ${priority}`)],
    }));
  };

  const assign: Ctx["assign"] = async (id, assignee, assigneeRole, actor) => {
    if (apiEnabled) {
      await helpdeskApi.assign(apiTicketId(id), {
        assignee_user_id: resolveEmployeeUserId(assignee),
        remarks: `Assigned by ${actor}`,
        expected_version: expectedVersion(id),
      });
      await invalidate();
      return;
    }
    update(id, (t) => ({
      ...t,
      assignee,
      assigneeRole,
      status: t.status === "new" ? "assigned" : t.status,
      events: [...t.events, evt(actor, "Assigned", `→ ${assignee}`)],
    }));
  };

  const setStatus: Ctx["setStatus"] = async (id, status, actor, note) => {
    if (apiEnabled) {
      await helpdeskApi.setStatus(apiTicketId(id), {
        status,
        remarks: note || (status === "on_hold" ? "Updated from frontend action" : undefined),
        expected_version: expectedVersion(id),
      });
      await invalidate();
      return;
    }
    update(id, (t) => ({
      ...t,
      status,
      events: [...t.events, evt(actor, `Status → ${status.replace("_", " ")}`, note)],
    }));
  };

  const resolve: Ctx["resolve"] = async (id, resolution, actor) => {
    if (apiEnabled) {
      await helpdeskApi.resolve(apiTicketId(id), {
        resolution,
        expected_version: expectedVersion(id),
      });
      await invalidate();
      return;
    }
    update(id, (t) => ({
      ...t,
      status: "resolved",
      resolvedAt: now(),
      resolution,
      events: [...t.events, evt(actor, "Resolved", resolution)],
    }));
  };

  const close: Ctx["close"] = async (id, actor) => {
    if (apiEnabled) {
      await helpdeskApi.close(apiTicketId(id), {
        remarks: `Closed by ${actor}`,
        expected_version: expectedVersion(id),
      });
      await invalidate();
      return;
    }
    update(id, (t) => ({
      ...t,
      status: "closed",
      closedAt: now(),
      events: [...t.events, evt(actor, "Closed")],
    }));
  };

  const reopen: Ctx["reopen"] = async (id, reason, actor) => {
    if (apiEnabled) {
      await helpdeskApi.reopen(apiTicketId(id), {
        reason,
        expected_version: expectedVersion(id),
      });
      await invalidate();
      return;
    }
    update(id, (t) => ({
      ...t,
      status: "reopened",
      resolvedAt: undefined,
      closedAt: undefined,
      reopenCount: t.reopenCount + 1,
      events: [...t.events, evt(actor, "Reopened", reason)],
    }));
  };

  const escalate: Ctx["escalate"] = async (id, reason, actor) => {
    if (apiEnabled) {
      await helpdeskApi.setStatus(apiTicketId(id), {
        status: "escalated",
        remarks: reason,
        expected_version: expectedVersion(id),
      });
      await invalidate();
      return;
    }
    update(id, (t) => ({
      ...t,
      escalated: true,
      status: "escalated",
      priority: t.priority === "Low" ? "Medium" : t.priority === "Medium" ? "High" : "Urgent",
      events: [...t.events, evt(actor, "Escalated", reason)],
    }));
  };

  const upsertCategory: Ctx["upsertCategory"] = async (c) => {
    if (apiEnabled) {
      if (c.apiId) {
        await helpdeskApi.updateCategory(c.apiId, {
          ...categoryBody(c),
          expected_version: c.version ?? 1,
        });
      } else {
        await helpdeskApi.createCategory({
          category_key: c.key,
          ...categoryBody(c),
        });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.domain("helpdesk") });
      return;
    }
    const idx = categories.findIndex((x) => x.key === c.key);
    if (idx === -1) persistC([...categories, c]);
    else persistC(categories.map((x) => (x.key === c.key ? c : x)));
  };

  const toggleCategory: Ctx["toggleCategory"] = async (key, active) => {
    if (apiEnabled) {
      const category = visibleCategories.find((candidate) => candidate.key === key);
      if (!category?.apiId) {
        throw new Error("Helpdesk category metadata is not loaded.");
      }
      const response = await helpdeskApi.updateCategory(category.apiId, {
        active,
        expected_version: category.version ?? 1,
      });
      const nextCategory = mapApiCategory((response as ApiRecord).category, {
        ...category,
        active,
      });
      queryClient.setQueryData(
        queryKeys.list("helpdesk", "categories", { active_only: false }),
        visibleCategories.map((candidate) => (candidate.key === key ? nextCategory : candidate)),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.domain("helpdesk") });
      return;
    }
    persistC(categories.map((c) => (c.key === key ? { ...c, active } : c)));
  };

  const reset = () => {
    persistT(SEED_TICKETS);
    persistC(SEED_CATEGORIES);
  };

  return (
    <Ctx_.Provider
      value={{
        tickets: visibleTickets,
        categories: visibleCategories,
        loading: apiEnabled && (apiTicketsQuery.isLoading || apiCategoriesQuery.isLoading),
        error: apiError,
        isApiBacked: apiEnabled,
        createTicket,
        addComment,
        addAttachment,
        changePriority,
        assign,
        setStatus,
        resolve,
        close,
        reopen,
        escalate,
        upsertCategory,
        toggleCategory,
        reset,
      }}
    >
      {children}
    </Ctx_.Provider>
  );
}

export function useHelpdesk() {
  const c = React.useContext(Ctx_);
  if (!c) throw new Error("useHelpdesk must be used inside HelpdeskProvider");
  return c;
}

export const HELPDESK_AGENT_ROLES = [
  "main_admin",
  "helpdesk_agent",
  "asset_admin",
  "hr_admin",
  "finance_manager",
] as const;

function categoryBody(category: CategoryConfig) {
  return {
    label: category.label,
    default_assignee_name: category.defaultAssignee || null,
    default_assignee_role: category.defaultAssigneeRole || null,
    team: category.team,
    active: category.active,
    sub_categories: category.subCategories,
  };
}

export function categoryForRole(role: string | null): TicketCategory[] {
  switch (role) {
    case "asset_admin":
      return ["IT", "Assets"];
    case "hr_admin":
      return ["HR"];
    case "finance_manager":
      return ["Finance"];
    case "helpdesk_agent":
      return ["IT", "Admin", "Project Support"];
    case "main_admin":
      return ["IT", "HR", "Finance", "Admin", "Assets", "Project Support"];
    default:
      return [];
  }
}

export const PRIORITY_TONE: Record<TicketPriority, { cls: string; dot: string }> = {
  Urgent: {
    cls: "bg-destructive/15 text-destructive border-destructive/30",
    dot: "bg-destructive",
  },
  High: {
    cls: "bg-warning/20 text-warning-foreground border-warning/40 dark:bg-warning/15 dark:text-warning dark:border-warning/30",
    dot: "bg-warning",
  },
  Medium: { cls: "bg-info/15 text-info border-info/30", dot: "bg-info" },
  Low: { cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground/60" },
};

export type { Ticket, TicketCategory, TicketPriority, TicketStatus, CategoryConfig };
