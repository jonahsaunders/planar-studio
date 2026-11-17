// Resolve the same conductor assignments for geometry checks and the IPC payload.
export function mapPlacementNets(art, saved = {}, referenceGroup, referenceDefault = referenceGroup) {
  const fields = ['tracks', 'arcs', 'vias', 'pads'];
  const names = new Set(fields.flatMap(key => art[key].map(item => item.net).filter(Boolean)));
  if (referenceGroup) names.add(referenceGroup);
  const selected = name => {
    if (!name) return null;
    if (Object.hasOwn(saved, name)) return saved[name];
    return name === referenceGroup ? referenceDefault : name;
  };
  const mapped = { ...art };
  for (const key of fields) mapped[key] = art[key].map(item => ({ ...item, net: selected(item.net) }));
  return {
    art: mapped,
    groups: [...names].map(name => ({
      name, net: selected(name), reference: name === referenceGroup,
    })),
    floating: fields.reduce((sum, key) => sum + art[key].filter(item => !item.net).length, 0),
    referenceNet: selected(referenceGroup),
  };
}
