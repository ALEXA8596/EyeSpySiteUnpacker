function sanitizeFileName(name: string): string {
  // if the name ends with a trailing space or period, remove it
  if (name.endsWith(" ") || name.endsWith(".")) {
    name = name.slice(0, -1);
  }
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

export default sanitizeFileName;