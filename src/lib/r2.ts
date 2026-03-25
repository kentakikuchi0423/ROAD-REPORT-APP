/**
 * Cloudflare R2 ストレージヘルパー（プレースホルダ）
 *
 * Step 6 で実装予定:
 *   - 画像ファイルのアップロード
 *   - 署名付き URL 生成
 *   - 画像ダウンロード
 */

/** 画像を R2 に保存してキーを返す */
export function uploadImage(
  _bucket: R2Bucket,
  _key: string,
  _data: ArrayBuffer,
  _contentType: string,
): Promise<string> {
  // TODO: Step 6 で実装
  return Promise.reject(new Error("Not implemented"));
}

/** R2 から画像を取得する */
export function downloadImage(
  _bucket: R2Bucket,
  _key: string,
): Promise<R2ObjectBody | null> {
  // TODO: Step 6 で実装
  return Promise.reject(new Error("Not implemented"));
}
