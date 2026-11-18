/**
 * The display name of a cost category. Categories arrive spelled either way
 * ("Labor" / "Labour"); the keys use "Labor". A category with no key shows its
 * own name -- never the raw "an.cat..." key, which is what the chart printed.
 */
export function categoryLabel(name: string, t: (key: string) => string): string {
  const key = `an.cat${name.replace(/\s+/g, "").replace(/^Labour$/i, "Labor")}`;
  const label = t(key);
  return label === key ? name : label;
}
