import type { Language } from "../store/uiStore";

/**
 * UI string dictionary. Keys are namespaced with dots (e.g. "nav.dashboard").
 * English is the source of truth and the fallback; Tamil ("ta") mirrors it.
 * Add new screens as new namespaces and keep the two maps key-aligned.
 */
export const translations: Record<Language, Record<string, string>> = {
  en: {
    // ---- Language switcher ----
    "lang.english": "English",
    "lang.tamil": "தமிழ்",
    "lang.switchTo": "தமிழ்",
    "lang.label": "Language",

    // ---- Navigation ----
    "nav.dashboard": "Dashboard",
    "nav.insights": "AI Insights",
    "nav.wbs": "WBS",
    "nav.dailylogs": "Daily Logs",
    "nav.labor": "Labor & Billing",
    "nav.inventory": "Inventory",
    "nav.procurement": "Procurement",
    "nav.consumption": "Consumption History",
    "nav.costs": "Cost Management",
    "nav.estimates": "Client Estimates",
    "nav.reports": "Reports",
    "nav.documents": "Document Vault",
    "nav.more": "More",

    // ---- Header / top bar ----
    "header.portfolio": "Portfolio",
    "header.controlCenter": "Control Center",
    "header.siteModeLive": "Site Mode Live",
    "header.switch": "Switch",
    "header.switchProject": "Switch Project",
    "header.newDprEntry": "New DPR Entry",

    // ---- Project status ----
    "status.planning": "Planning",
    "status.active": "Active",
    "status.onHold": "On Hold",
    "status.completed": "Completed",

    // ---- Common actions ----
    "common.export": "Export",
    "common.exportCsv": "Export CSV",
    "common.exportPdf": "Export PDF",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.add": "Add",
    "common.edit": "Edit",
    "common.delete": "Delete",
    "common.close": "Close",
    "common.confirm": "Confirm",
    "common.search": "Search",
    "common.filter": "Filter",
    "common.loading": "Loading...",
    "common.noData": "No data available",
    "common.total": "Total",
    "common.date": "Date",
    "common.name": "Name",
    "common.status": "Status",
    "common.actions": "Actions",
    "common.all": "All",
    "common.back": "Back",
    "common.next": "Next",
    "common.submit": "Submit",
    "common.view": "View",
    "common.download": "Download",
    "common.managerAccessRequired": "Manager Access Required",

    // ---- Dashboard ----
    "dashboard.title": "Dashboard",
    "dashboard.overview": "Project Overview",
    "dashboard.overallProgress": "Overall Progress",
    "dashboard.budget": "Budget",
    "dashboard.spent": "Spent",
    "dashboard.remaining": "Remaining",
    "dashboard.tasksActive": "Tasks Active",
    "dashboard.totalLabourDays": "Total Labour Days",
    "dashboard.uniqueMaterials": "Unique Materials",
    "dashboard.recentActivity": "Recent Activity",
    "dashboard.quickActions": "Quick Actions",

    // ---- Reports ----
    "reports.title": "Progress Reports",
    "reports.subtitle": "Generate project updates from daily logs.",
    "reports.daily": "Daily",
    "reports.weekly": "Weekly",
    "reports.monthly": "Monthly",
    "reports.reportDatePeriod": "Report Date/Period",
    "reports.aggregating": "Aggregating Report Data...",
    "reports.noLogs": "No logs found for this period.",
  },

  ta: {
    // ---- Language switcher ----
    "lang.english": "English",
    "lang.tamil": "தமிழ்",
    "lang.switchTo": "English",
    "lang.label": "மொழி",

    // ---- Navigation ----
    "nav.dashboard": "டாஷ்போர்டு",
    "nav.insights": "AI நுண்ணறிவு",
    "nav.wbs": "பணிப் பிரிவு",
    "nav.dailylogs": "தினசரி பதிவுகள்",
    "nav.labor": "தொழிலாளர் & பில்லிங்",
    "nav.inventory": "சரக்கு",
    "nav.procurement": "கொள்முதல்",
    "nav.consumption": "நுகர்வு வரலாறு",
    "nav.costs": "செலவு மேலாண்மை",
    "nav.estimates": "வாடிக்கையாளர் மதிப்பீடுகள்",
    "nav.reports": "அறிக்கைகள்",
    "nav.documents": "ஆவண களஞ்சியம்",
    "nav.more": "மேலும்",

    // ---- Header / top bar ----
    "header.portfolio": "போர்ட்ஃபோலியோ",
    "header.controlCenter": "கட்டுப்பாட்டு மையம்",
    "header.siteModeLive": "தள பயன்முறை இயக்கத்தில்",
    "header.switch": "மாற்று",
    "header.switchProject": "செயல்திட்டத்தை மாற்று",
    "header.newDprEntry": "புதிய DPR பதிவு",

    // ---- Project status ----
    "status.planning": "திட்டமிடல்",
    "status.active": "செயலில்",
    "status.onHold": "நிறுத்தத்தில்",
    "status.completed": "முடிந்தது",

    // ---- Common actions ----
    "common.export": "ஏற்றுமதி",
    "common.exportCsv": "CSV ஏற்றுமதி",
    "common.exportPdf": "PDF ஏற்றுமதி",
    "common.save": "சேமி",
    "common.cancel": "ரத்து",
    "common.add": "சேர்",
    "common.edit": "திருத்து",
    "common.delete": "நீக்கு",
    "common.close": "மூடு",
    "common.confirm": "உறுதிப்படுத்து",
    "common.search": "தேடு",
    "common.filter": "வடிகட்டு",
    "common.loading": "ஏற்றுகிறது...",
    "common.noData": "தரவு எதுவும் இல்லை",
    "common.total": "மொத்தம்",
    "common.date": "தேதி",
    "common.name": "பெயர்",
    "common.status": "நிலை",
    "common.actions": "செயல்கள்",
    "common.all": "அனைத்தும்",
    "common.back": "பின்",
    "common.next": "அடுத்து",
    "common.submit": "சமர்ப்பி",
    "common.view": "பார்",
    "common.download": "பதிவிறக்கு",
    "common.managerAccessRequired": "மேலாளர் அணுகல் தேவை",

    // ---- Dashboard ----
    "dashboard.title": "டாஷ்போர்டு",
    "dashboard.overview": "செயல்திட்ட மேலோட்டம்",
    "dashboard.overallProgress": "ஒட்டுமொத்த முன்னேற்றம்",
    "dashboard.budget": "பட்ஜெட்",
    "dashboard.spent": "செலவழித்தது",
    "dashboard.remaining": "மீதம்",
    "dashboard.tasksActive": "செயலில் உள்ள பணிகள்",
    "dashboard.totalLabourDays": "மொத்த தொழிலாளர் நாட்கள்",
    "dashboard.uniqueMaterials": "தனித்துவ பொருட்கள்",
    "dashboard.recentActivity": "சமீபத்திய செயல்பாடு",
    "dashboard.quickActions": "விரைவு செயல்கள்",

    // ---- Reports ----
    "reports.title": "முன்னேற்ற அறிக்கைகள்",
    "reports.subtitle": "தினசரி பதிவுகளிலிருந்து செயல்திட்ட புதுப்பிப்புகளை உருவாக்கவும்.",
    "reports.daily": "தினசரி",
    "reports.weekly": "வாராந்திர",
    "reports.monthly": "மாதாந்திர",
    "reports.reportDatePeriod": "அறிக்கை தேதி/காலம்",
    "reports.aggregating": "அறிக்கை தரவு தொகுக்கப்படுகிறது...",
    "reports.noLogs": "இந்த காலத்திற்கு பதிவுகள் இல்லை.",
  },
};
