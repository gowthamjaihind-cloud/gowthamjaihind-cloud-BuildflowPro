import re

with open("src/components/ProgressReportsView.tsx", "r") as f:
    text = f.read()

# Fix selectedDate initialization
old_init = """  const [selectedDate, setSelectedDate] = useState(
    new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
      .toISOString()
      .split("T")[0],
  );"""

new_init = """  const [selectedDate, setSelectedDate] = useState(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
  );"""
text = text.replace(old_init, new_init)

# Fix safe formatting
safe_format = """  const safeFormat = (dateStr: string, fmt: string) => {
    if (!dateStr) return "Invalid Date";
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return "Invalid Date";
    const dt = new Date(y, m - 1, d);
    if (isNaN(dt.getTime())) return "Invalid Date";
    return format(dt, fmt);
  };
"""

text = text.replace("  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);", "  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);\n" + safe_format)

old_start = """  const startDate = useMemo(() => {
    const d = new Date(selectedDate);
    if (reportType === "daily") return selectedDate;
    if (reportType === "weekly")
      return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    return format(startOfMonth(d), "yyyy-MM-dd");
  }, [selectedDate, reportType]);"""

new_start = """  const startDate = useMemo(() => {
    if (!selectedDate) return "";
    const [y, m, d] = selectedDate.split("-").map(Number);
    if (!y || !m || !d) return "";
    const dt = new Date(y, m - 1, d);
    if (reportType === "daily") return selectedDate;
    if (reportType === "weekly")
      return format(startOfWeek(dt, { weekStartsOn: 1 }), "yyyy-MM-dd");
    return format(startOfMonth(dt), "yyyy-MM-dd");
  }, [selectedDate, reportType]);"""
text = text.replace(old_start, new_start)

old_end = """  const endDate = useMemo(() => {
    const d = new Date(selectedDate);
    if (reportType === "daily") return selectedDate;
    if (reportType === "weekly")
      return format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    return format(endOfMonth(d), "yyyy-MM-dd");
  }, [selectedDate, reportType]);"""

new_end = """  const endDate = useMemo(() => {
    if (!selectedDate) return "";
    const [y, m, d] = selectedDate.split("-").map(Number);
    if (!y || !m || !d) return "";
    const dt = new Date(y, m - 1, d);
    if (reportType === "daily") return selectedDate;
    if (reportType === "weekly")
      return format(endOfWeek(dt, { weekStartsOn: 1 }), "yyyy-MM-dd");
    return format(endOfMonth(dt), "yyyy-MM-dd");
  }, [selectedDate, reportType]);"""
text = text.replace(old_end, new_end)

old_ui = """                <p className="text-base font-black">
                  {isDaily
                    ? format(new Date(selectedDate), "dd MMM yyyy")
                    : `${format(new Date(startDate), "dd MMM yyyy")} to ${format(new Date(endDate), "dd MMM yyyy")}`}
                </p>"""

new_ui = """                <p className="text-base font-black">
                  {isDaily
                    ? safeFormat(selectedDate, "dd MMM yyyy")
                    : `${safeFormat(startDate, "dd MMM yyyy")} to ${safeFormat(endDate, "dd MMM yyyy")}`}
                </p>"""
text = text.replace(old_ui, new_ui)

with open("src/components/ProgressReportsView.tsx", "w") as f:
    f.write(text)
