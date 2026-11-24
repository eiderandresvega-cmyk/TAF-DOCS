export function download(blob: Blob, title: string, extension: string): void {
  const name = title.normalize('NFKC').trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-')
    .replace(/^\.+|[. ]+$/g, '')
    .slice(0, 100) || 'proyecto-taf'
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}.${extension}`
  document.body.append(link)
  link.click()
  link.remove()
  // Safari may read the object URL after handling the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000)
}
