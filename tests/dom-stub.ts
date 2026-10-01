/** Small semantic DOM fixture; no browser layout or visual claims. */
export class ElementStub extends EventTarget {
  children: ElementStub[] = []
  parentElement: ElementStub | null = null
  dataset: Record<string, string> = {}
  style: Record<string, string> = {}
  attributes = new Map<string, string>()
  className = ''
  textContent = ''
  hidden = false
  type = ''
  title = ''
  rect = { left: 350, width: 1000, height: 56, bottom: 106 }
  constructor(readonly tagName = 'DIV') { super() }
  get isConnected(): boolean { return this.tagName === 'HTML' || this.parentElement?.isConnected === true }
  get classList(): { contains(name: string): boolean } {
    return { contains: name => this.className.split(' ').includes(name) }
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value
  }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null }
  hasAttribute(name: string): boolean { return this.attributes.has(name) }
  append(...nodes: ElementStub[]): void {
    for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node) }
  }
  appendChild(node: ElementStub): ElementStub { this.append(node); return node }
  prepend(node: ElementStub): void { node.remove(); node.parentElement = this; this.children.unshift(node) }
  remove(): void {
    if (this.parentElement !== null) this.parentElement.children = this.parentElement.children.filter(child => child !== this)
    this.parentElement = null
  }
  matches(selector: string): boolean {
    if (selector.startsWith('.')) {
      const name = /^\.([\w-]+)/.exec(selector)?.[1] ?? ''
      if (!this.classList.contains(name)) return false
      selector = selector.slice(name.length + 1)
    }
    const tag = /^[a-z]+/i.exec(selector)?.[0]
    if (tag !== undefined && this.tagName !== tag.toUpperCase()) return false
    for (const match of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
      const name = match[1]!
      if (!this.hasAttribute(name) || (match[2] !== undefined && this.getAttribute(name) !== match[2])) return false
    }
    return true
  }
  querySelectorAll(selector: string): ElementStub[] {
    const direct = selector.startsWith(':scope > ')
    const pattern = direct ? selector.slice(9) : selector
    return this.children.flatMap(child => [
      ...(child.matches(pattern) ? [child] : []), ...(direct ? [] : child.querySelectorAll(pattern)),
    ])
  }
  querySelector(selector: string): ElementStub | null { return this.querySelectorAll(selector)[0] ?? null }
  getBoundingClientRect(): typeof this.rect { return this.rect }
}

export class DocumentStub extends EventTarget {
  documentElement = new ElementStub('HTML')
  head = new ElementStub('HEAD')
  body = new ElementStub('BODY')
  constructor() { super(); this.documentElement.append(this.head, this.body) }
  createElement(tag: string): ElementStub { return new ElementStub(tag.toUpperCase()) }
  querySelectorAll(selector: string): ElementStub[] { return this.documentElement.querySelectorAll(selector) }
  querySelector(selector: string): ElementStub | null { return this.querySelectorAll(selector)[0] ?? null }
}

export class ObserverStub {
  observe(): void {}
  disconnect(): void {}
}
