/**
 * Base type for everything that can serialize itself into Hammerwatch's
 * level XML dialect (ported from XMLObject.java).
 */
export abstract class XMLObject {
  abstract getXML(): string
}
