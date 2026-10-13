/** Web: trigger a normal browser download. */
export async function saveAndShareText(fileName: string, content: string, mimeType = 'text/csv'): Promise<string> {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return fileName;
}
