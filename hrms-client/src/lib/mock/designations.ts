export interface Designation {
  id: string;
  apiId?: string;
  title: string;
  level: "Junior" | "Mid" | "Senior" | "Lead" | "Principal" | "Director";
  department: string;
}

export const DESIGNATIONS: Designation[] = [
  { id: "DSG-00", title: "Admin", level: "Lead", department: "People Ops" },
  { id: "DSG-01", title: "Software Engineer", level: "Mid", department: "Engineering" },
  { id: "DSG-02", title: "Senior Software Engineer", level: "Senior", department: "Engineering" },
  { id: "DSG-03", title: "Engineering Manager", level: "Lead", department: "Engineering" },
  { id: "DSG-04", title: "Product Designer", level: "Mid", department: "Design" },
  { id: "DSG-05", title: "Product Manager", level: "Senior", department: "Product" },
  { id: "DSG-06", title: "HR Director", level: "Director", department: "People Ops" },
  { id: "DSG-07", title: "Finance Manager", level: "Lead", department: "Finance" },
  { id: "DSG-08", title: "IT Operations Lead", level: "Lead", department: "IT Operations" },
  { id: "DSG-09", title: "Helpdesk Specialist", level: "Mid", department: "Support" },
  { id: "DSG-10", title: "Data Analyst", level: "Mid", department: "Analytics" },
  { id: "DSG-11", title: "HR Manager", level: "Lead", department: "People Ops" },
  { id: "DSG-12", title: "Project Manager", level: "Lead", department: "Product" },
  { id: "DSG-13", title: "Asset Manager", level: "Lead", department: "IT Operations" },
  { id: "DSG-14", title: "Auditor", level: "Senior", department: "Finance" },
  { id: "DSG-15", title: "Director", level: "Director", department: "Executive" },
  { id: "DSG-16", title: "Reviewer", level: "Senior", department: "Operations" },
  { id: "DSG-17", title: "Employee", level: "Junior", department: "Operations" },
  { id: "DSG-18", title: "Helpdesk Agent", level: "Mid", department: "Support" },
  { id: "DSG-19", title: "Helpdesk Manager", level: "Lead", department: "Support" },
];
