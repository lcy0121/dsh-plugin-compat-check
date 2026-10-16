/** Small abstract values only; no inspected code is evaluated. */
export function hasEvidence(value, seen = new Set()) {
  if (!value || seen.has(value)) return false;
  seen.add(value);
  if (["context", "service", "method"].includes(value.kind)) return true;
  if (value.kind === "proxy") return hasEvidence(value.target, seen);
  return value.fields
    ? [...value.fields.values()].some((v) => hasEvidence(v, seen))
    : false;
}
export function hasProof(value, seen = new Set()) {
  if (!value || seen.has(value)) return false;
  seen.add(value);
  if (value.kind === "proxy")
    return (
      !value.handler?.opaque &&
      value.handler?.fields?.size === 0 &&
      hasProof(value.target, seen)
    );
  if (value.kind === "context" || value.kind === "service")
    return value.inferred === false && !value.state?.opaque;
  if (value.kind === "method") return hasProof(value.receiver, seen);
  return value.fields && !value.opaque
    ? [...value.fields.values()].some((v) => hasProof(v, seen))
    : false;
}
export function sameValue(a, b, depth = 0) {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || depth > 12) return false;
  if (a.kind === "constant") return a.value === b.value;
  // Mutable values are equal only when they share identity. Structural equality
  // must never choose one object as the destination of a conditional write.
  if (a.kind === "context" || a.kind === "service")
    return (
      a.kind === b.kind &&
      a.service === b.service &&
      a.inferred === b.inferred &&
      !!a.state &&
      a.state === b.state
    );
  if (a.kind === "method")
    return (
      a.service === b.service &&
      a.method === b.method &&
      sameValue(a.receiver, b.receiver, depth + 1)
    );
  return false;
}
export function mergedValue(values) {
  return values.length && values.every((v) => sameValue(v, values[0]))
    ? values[0]
    : null;
}
