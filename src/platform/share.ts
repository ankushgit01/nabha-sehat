/**
 * Save + share a text file (native). Writes into the app's documents folder, then
 * opens the system share sheet (WhatsApp, Gmail, Drive, Files, …). Works offline;
 * the share target decides whether it needs internet.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export async function saveAndShareText(fileName: string, content: string, mimeType = 'text/csv'): Promise<string> {
  const uri = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: fileName, UTI: 'public.comma-separated-values-text' });
  }
  return uri;
}
