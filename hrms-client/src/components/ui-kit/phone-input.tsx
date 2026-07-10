import * as React from "react";
import { Check } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface PhoneCountry {
  iso: string;
  name: string;
  dialCode: string;
}

const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "IN", name: "India", dialCode: "+91" },
  { iso: "US", name: "United States", dialCode: "+1" },
  { iso: "CA", name: "Canada", dialCode: "+1" },
  { iso: "GB", name: "United Kingdom", dialCode: "+44" },
  { iso: "AE", name: "United Arab Emirates", dialCode: "+971" },
  { iso: "SG", name: "Singapore", dialCode: "+65" },
  { iso: "AU", name: "Australia", dialCode: "+61" },
  { iso: "NZ", name: "New Zealand", dialCode: "+64" },
  { iso: "DE", name: "Germany", dialCode: "+49" },
  { iso: "FR", name: "France", dialCode: "+33" },
  { iso: "IT", name: "Italy", dialCode: "+39" },
  { iso: "ES", name: "Spain", dialCode: "+34" },
  { iso: "PT", name: "Portugal", dialCode: "+351" },
  { iso: "IE", name: "Ireland", dialCode: "+353" },
  { iso: "NL", name: "Netherlands", dialCode: "+31" },
  { iso: "SE", name: "Sweden", dialCode: "+46" },
  { iso: "CH", name: "Switzerland", dialCode: "+41" },
  { iso: "JP", name: "Japan", dialCode: "+81" },
  { iso: "KR", name: "South Korea", dialCode: "+82" },
  { iso: "CN", name: "China", dialCode: "+86" },
  { iso: "HK", name: "Hong Kong", dialCode: "+852" },
  { iso: "MY", name: "Malaysia", dialCode: "+60" },
  { iso: "TH", name: "Thailand", dialCode: "+66" },
  { iso: "ID", name: "Indonesia", dialCode: "+62" },
  { iso: "PH", name: "Philippines", dialCode: "+63" },
  { iso: "VN", name: "Vietnam", dialCode: "+84" },
  { iso: "BD", name: "Bangladesh", dialCode: "+880" },
  { iso: "PK", name: "Pakistan", dialCode: "+92" },
  { iso: "LK", name: "Sri Lanka", dialCode: "+94" },
  { iso: "NP", name: "Nepal", dialCode: "+977" },
  { iso: "SA", name: "Saudi Arabia", dialCode: "+966" },
  { iso: "QA", name: "Qatar", dialCode: "+974" },
  { iso: "KW", name: "Kuwait", dialCode: "+965" },
  { iso: "OM", name: "Oman", dialCode: "+968" },
  { iso: "BH", name: "Bahrain", dialCode: "+973" },
  { iso: "ZA", name: "South Africa", dialCode: "+27" },
  { iso: "EG", name: "Egypt", dialCode: "+20" },
  { iso: "NG", name: "Nigeria", dialCode: "+234" },
  { iso: "KE", name: "Kenya", dialCode: "+254" },
  { iso: "BR", name: "Brazil", dialCode: "+55" },
  { iso: "MX", name: "Mexico", dialCode: "+52" },
  { iso: "AR", name: "Argentina", dialCode: "+54" },
  { iso: "RU", name: "Russia", dialCode: "+7" },
  { iso: "TR", name: "Turkey", dialCode: "+90" },
  { iso: "IL", name: "Israel", dialCode: "+972" },
];

interface PhoneInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> {
  value: string;
  onChange: (value: string) => void;
  defaultCountryIso?: string;
  countries?: PhoneCountry[];
}

export function PhoneInput({
  value,
  onChange,
  defaultCountryIso = "IN",
  countries = PHONE_COUNTRIES,
  className,
  disabled,
  placeholder = "Phone number",
  ...inputProps
}: PhoneInputProps) {
  const defaultCountry = findCountry(countries, defaultCountryIso) ?? countries[0];
  const parsed = React.useMemo(
    () => parsePhoneValue(value, countries, defaultCountry),
    [countries, defaultCountry, value],
  );
  const [open, setOpen] = React.useState(false);
  const [selectedCountry, setSelectedCountry] = React.useState<PhoneCountry>(parsed.country);

  React.useEffect(() => {
    if (
      value.trim() &&
      parsed.country.iso !== selectedCountry.iso &&
      parsed.country.dialCode !== selectedCountry.dialCode
    ) {
      setSelectedCountry(parsed.country);
    }
  }, [parsed.country, selectedCountry.dialCode, selectedCountry.iso, value]);

  const nationalValue = parsed.nationalNumber;

  const commitNumber = (nextNumber: string, country = selectedCountry) => {
    const sanitized = sanitizeNationalNumber(nextNumber);
    onChange(sanitized.trim() ? `${country.dialCode} ${sanitized}` : "");
  };

  const selectCountry = (country: PhoneCountry) => {
    setSelectedCountry(country);
    setOpen(false);
    if (nationalValue.trim()) {
      onChange(`${country.dialCode} ${nationalValue}`);
    }
  };

  return (
    <div className={cn("phone-input", disabled && "phone-input--disabled", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="phone-input__country"
            aria-label={`Select country calling code. Current selection: ${selectedCountry.name} ${selectedCountry.dialCode}`}
          >
            <span className="phone-input__dial">{selectedCountry.dialCode}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="glass-panel w-[min(24rem,calc(100vw-2rem))] p-0">
          <Command>
            <CommandInput placeholder="Search country or code..." />
            <CommandList>
              <CommandEmpty>No country code found.</CommandEmpty>
              <CommandGroup>
                {countries.map((country) => {
                  const isSelected = selectedCountry.iso === country.iso;

                  return (
                    <CommandItem
                      key={`${country.iso}-${country.dialCode}`}
                      value={`${country.name} ${country.iso} ${country.dialCode}`}
                      onSelect={() => selectCountry(country)}
                      className={cn(
                        "phone-input__country-option",
                        isSelected && "phone-input__country-option--active",
                      )}
                      aria-selected={isSelected}
                    >
                      <span className="min-w-10 text-sm font-semibold text-foreground">
                        {country.dialCode}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{country.name}</span>
                      <span className="text-xs text-muted-foreground">{country.iso}</span>
                      <Check
                        className={cn(
                          "ml-1 h-4 w-4 text-primary",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden="true"
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <input
        {...inputProps}
        type="tel"
        inputMode="tel"
        autoComplete={inputProps.autoComplete ?? "tel"}
        disabled={disabled}
        value={nationalValue}
        onChange={(event) => commitNumber(event.target.value)}
        placeholder={placeholder}
        className="phone-input__number"
      />
    </div>
  );
}

function findCountry(countries: PhoneCountry[], iso: string) {
  return countries.find((country) => country.iso.toLowerCase() === iso.toLowerCase());
}

function parsePhoneValue(
  value: string,
  countries: PhoneCountry[],
  defaultCountry: PhoneCountry,
): { country: PhoneCountry; nationalNumber: string } {
  const trimmed = value.trim();
  if (!trimmed) return { country: defaultCountry, nationalNumber: "" };

  const compact = trimmed.replace(/[^\d+]/g, "");
  const match = [...countries]
    .sort((left, right) => right.dialCode.length - left.dialCode.length)
    .find((country) => compact.startsWith(country.dialCode));

  if (!match) {
    return {
      country: defaultCountry,
      nationalNumber: sanitizeNationalNumber(trimmed.replace(/^\+/, "")),
    };
  }

  return {
    country: match,
    nationalNumber: sanitizeNationalNumber(compact.slice(match.dialCode.length)),
  };
}

function sanitizeNationalNumber(value: string) {
  return value
    .replace(/[^\d\s().-]/g, "")
    .replace(/\s{2,}/g, " ")
    .trimStart();
}
