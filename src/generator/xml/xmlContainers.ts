import { XMLObject } from './xmlObject'

/** `<array name="...">...</array>` — children concatenated without separators (XMLArray.java) */
export class XMLArray extends XMLObject {
  private dataList: XMLObject[] = []

  constructor(public name: string) {
    super()
  }

  addData(object: XMLObject): void {
    this.dataList.push(object)
  }

  getXML(): string {
    const children = this.dataList.map((d) => d.getXML()).join('')
    return `<array name="${this.name}">${children}</array>`
  }
}

/**
 * `<dictionary [name="..."]>...</dictionary>` — one child per line (XMLDictionary.java).
 * An empty name omits the attribute entirely.
 */
export class XMLDictionary extends XMLObject {
  private dataList: XMLObject[] = []

  constructor(public name: string) {
    super()
  }

  addData(object: XMLObject): void {
    this.dataList.push(object)
  }

  getXML(): string {
    let xml = '<dictionary'
    if (this.name !== '') {
      xml += ` name="${this.name}"`
    }
    xml += '>\n'
    for (const d of this.dataList) {
      xml += `${d.getXML()}\n`
    }
    return xml + '</dictionary>\n'
  }
}
