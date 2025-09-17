// domain.js - utility to check if a hostname matches a disabled domain entry

function hostMatchesDisabled(host, disabled) {
  if (!host || !disabled) return false;
  host = host.toLowerCase();
  disabled = disabled.toLowerCase();
  return host === disabled || host.endsWith('.' + disabled);
}

module.exports = { hostMatchesDisabled };
