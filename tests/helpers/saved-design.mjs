export function savedDesign(kind, name) {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('planar.design.')) continue;
    const value = JSON.parse(localStorage.getItem(key));
    if (value.kind === kind && (name == null || value.name === name)) {
      return { ...value, id: key.slice('planar.design.'.length) };
    }
  }
  return null;
}
