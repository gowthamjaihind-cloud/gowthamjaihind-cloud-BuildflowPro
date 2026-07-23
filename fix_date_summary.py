import re

with open("src/server/telegram/handlers/log.ts", "r") as f:
    text = f.read()

# Fix fmtDate
old_fmt = """const fmtDate = (iso) => {
    const d = new Date(iso + "T00:00:00Z");
};"""

new_fmt = """const fmtDate = (iso) => {
    if (!iso) return "Unknown Date";
    const d = new Date(iso + "T00:00:00Z");
    if (isNaN(d.getTime())) return "Unknown Date";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};"""

text = text.replace(old_fmt, new_fmt)

# Fix summary
old_summary = """    let summary = `✅ <b>Logged</b>\\n\\n${d.taskName} — ${d.progressPercent}%`;
    if ((d.materials || []).length)
        summary += `\\n📦 ${d.materials.length} material(s)`;
    if ((d.labour || []).length)
        summary += `\\n👷 ${d.labour.length} labour`;
        
    const buttons = ["""

new_summary = """    let summary = `✅ <b>Logged</b>\\n\\n${d.taskName} — ${d.progressPercent}%`;
    if ((d.materials || []).length) {
        summary += `\\n📦 <b>Materials:</b>`;
        d.materials.forEach(m => {
            summary += `\\n- ${m.name}: ${m.quantity} ${m.unit || ''}`;
        });
    }
    if ((d.labour || []).length) {
        summary += `\\n👷 <b>Labour:</b>`;
        d.labour.forEach(l => {
            summary += `\\n- ${l.roleName || l.role}: ${l.headcount}`;
        });
    }
    
    summary += `\\n\\nReport generated successfully. The respective WBS and costs are updated.`;
        
    const buttons = ["""

text = text.replace(old_summary, new_summary)

with open("src/server/telegram/handlers/log.ts", "w") as f:
    f.write(text)
