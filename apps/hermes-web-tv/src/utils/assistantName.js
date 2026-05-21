function resolveAssistantName(input) {
  var raw = '';
  if (typeof input === 'string') {
    raw = input;
  } else if (input && typeof input.agent_name === 'string') {
    raw = input.agent_name;
  }
  var name = raw.trim();
  if (!name || name.toLowerCase() === 'hermes') {
    return 'DaveTV';
  }
  if (name.length > 30) {
    return name.substring(0, 30);
  }
  return name;
}

export { resolveAssistantName };
