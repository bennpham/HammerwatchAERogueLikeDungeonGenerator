import { XMLObject } from './xmlObject'

/** `<int name="...">value</int>` (XMLInt.java) */
export class XMLInt extends XMLObject {
  constructor(
    public name: string,
    public value: number
  ) {
    super()
  }

  getXML(): string {
    return `<int name="${this.name}">${Math.trunc(this.value)}</int>`
  }
}

/**
 * `<float name="...">value</float>` (XMLFloat.java).
 * Java printed floats with %f (6 decimals); toFixed(6) matches that.
 */
export class XMLFloat extends XMLObject {
  constructor(
    public name: string,
    public value: number
  ) {
    super()
  }

  getXML(): string {
    return `<float name="${this.name}">${this.value.toFixed(6)}</float>`
  }
}

/** `<bool name="...">True|False</bool>` (XMLBool.java) */
export class XMLBool extends XMLObject {
  constructor(
    public name: string,
    public value: boolean
  ) {
    super()
  }

  getXML(): string {
    return `<bool name="${this.name}">${this.value ? 'True' : 'False'}</bool>`
  }
}

/** `<string name="...">value</string>` (XMLString.java) */
export class XMLString extends XMLObject {
  constructor(
    public name: string,
    public value: string
  ) {
    super()
  }

  getXML(): string {
    return `<string name="${this.name}">${this.value}</string>`
  }
}

/** `<int-arr name="...">1 2 3</int-arr>` (XMLIntArray.java) */
export class XMLIntArray extends XMLObject {
  data: number[]

  constructor(
    public name: string,
    data: number[]
  ) {
    super()
    this.data = [...data]
  }

  getXML(): string {
    return `<int-arr name="${this.name}">${this.data.map((d) => Math.trunc(d)).join(' ')}</int-arr>`
  }
}

/**
 * A pre-serialized XML fragment, emitted verbatim.
 *
 * Most nodes express their `parameters` as a `<dictionary>`, but SpawnObject,
 * GlobalEventTrigger and TimerTrigger carry a bare scalar instead — a shape a
 * dictionary cannot express. This lets a node splice that raw string into a
 * parent dictionary without re-serializing it.
 */
export class XMLRaw extends XMLObject {
  constructor(public xml: string) {
    super()
  }

  getXML(): string {
    return this.xml
  }
}
