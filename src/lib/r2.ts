/**
 * Cloudflare R2 ストレージヘルパー
 */

/**
 * 画像を R2 に保存してキーを返す。
 *
 * @param bucket      R2 バケット
 * @param key         保存先キー（例: "reports/20260325/uuid/close.jpg"）
 * @param data        画像バイナリ
 * @param contentType MIME タイプ（例: "image/jpeg"）
 */
export async function uploadImage(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<string> {
  await bucket.put(key, data, { httpMetadata: { contentType } });
  return key;
}

/**
 * R2 から画像を取得する。存在しない場合は null を返す。
 *
 * @param bucket R2 バケット
 * @param key    取得するキー
 */
export async function downloadImage(
  bucket: R2Bucket,
  key: string,
): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}

/**
 * R2 から画像を削除する。
 *
 * @param bucket R2 バケット
 * @param key    削除するキー
 */
export async function deleteImage(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}
