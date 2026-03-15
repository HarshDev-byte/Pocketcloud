import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

/**
 * WebDAV XML Builder Utilities
 * 
 * Implements RFC 4918 compliant XML generation for WebDAV responses
 */

export interface WebDAVResource {
  href: string;
  displayName: string;
  contentLength?: number;
  contentType?: string;
  lastModified: string;
  creationDate: string;
  etag: string;
  isCollection: boolean;
  lockToken?: string;
  lockTimeout?: number;
}

export interface WebDAVProperty {
  namespace: string;
  name: string;
  value?: string;
  status?: string;
}

export interface WebDAVResponse {
  href: string;
  properties: WebDAVProperty[];
  status: string;
}

export interface LockInfo {
  token: string;
  owner: string;
  timeout: number;
  depth: string;
  scope: 'exclusive' | 'shared';
  type: 'write';
  created: Date;
}

/**
 * In-memory lock store with TTL
 */
class LockStore {
  private locks = new Map<string, LockInfo>();
  private timeouts = new Map<string, NodeJS.Timeout>();

  public createLock(path: string, owner: string, timeout: number = 1800): LockInfo {
    const token = `opaquelocktoken:${this.generateUUID()}`;
    const lockInfo: LockInfo = {
      token,
      owner,
      timeout,
      depth: 'infinity',
      scope: 'exclusive',
      type: 'write',
      created: new Date()
    };

    // Clear existing lock if any
    this.releaseLock(path);

    // Store lock
    this.locks.set(path, lockInfo);

    // Set timeout to auto-release
    const timeoutId = setTimeout(() => {
      this.releaseLock(path);
    }, timeout * 1000);
    
    this.timeouts.set(path, timeoutId);

    return lockInfo;
  }

  public getLock(path: string): LockInfo | null {
    return this.locks.get(path) || null;
  }

  public releaseLock(path: string): boolean {
    const timeoutId = this.timeouts.get(path);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(path);
    }
    return this.locks.delete(path);
  }

  public isLocked(path: string): boolean {
    return this.locks.has(path);
  }

  public validateLockToken(path: string, token: string): boolean {
    const lock = this.locks.get(path);
    return lock ? lock.token === token : false;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

export const lockStore = new LockStore();

/**
 * Build RFC 4918 compliant multistatus XML response
 */
export function buildMultistatus(responses: WebDAVResponse[]): string {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${responses.map(response => buildResponseXML(response)).join('\n')}
</D:multistatus>`;

  return xml;
}

/**
 * Build PROPFIND response XML for a single resource
 */
export function buildPropfind(resource: WebDAVResource): string {
  const properties: WebDAVProperty[] = [
    {
      namespace: 'DAV:',
      name: 'displayname',
      value: resource.displayName,
      status: 'HTTP/1.1 200 OK'
    },
    {
      namespace: 'DAV:',
      name: 'getlastmodified',
      value: formatRFC1123Date(new Date(resource.lastModified)),
      status: 'HTTP/1.1 200 OK'
    },
    {
      namespace: 'DAV:',
      name: 'creationdate',
      value: new Date(resource.creationDate).toISOString(),
      status: 'HTTP/1.1 200 OK'
    },
    {
      namespace: 'DAV:',
      name: 'getetag',
      value: resource.etag,
      status: 'HTTP/1.1 200 OK'
    }
  ];

  if (resource.isCollection) {
    properties.push({
      namespace: 'DAV:',
      name: 'resourcetype',
      value: '<D:collection/>',
      status: 'HTTP/1.1 200 OK'
    });
  } else {
    properties.push(
      {
        namespace: 'DAV:',
        name: 'resourcetype',
        value: '',
        status: 'HTTP/1.1 200 OK'
      },
      {
        namespace: 'DAV:',
        name: 'getcontentlength',
        value: (resource.contentLength || 0).toString(),
        status: 'HTTP/1.1 200 OK'
      },
      {
        namespace: 'DAV:',
        name: 'getcontenttype',
        value: resource.contentType || 'application/octet-stream',
        status: 'HTTP/1.1 200 OK'
      }
    );
  }

  const response: WebDAVResponse = {
    href: resource.href,
    properties,
    status: 'HTTP/1.1 200 OK'
  };

  return buildMultistatus([response]);
}

/**
 * Build individual response XML element
 */
function buildResponseXML(response: WebDAVResponse): string {
  const propsByStatus = new Map<string, WebDAVProperty[]>();
  
  response.properties.forEach(prop => {
    const status = prop.status || 'HTTP/1.1 200 OK';
    if (!propsByStatus.has(status)) {
      propsByStatus.set(status, []);
    }
    propsByStatus.get(status)!.push(prop);
  });

  let xml = `  <D:response>
    <D:href>${escapeXML(response.href)}</D:href>`;

  propsByStatus.forEach((props, status) => {
    xml += `
    <D:propstat>
      <D:prop>`;
    
    props.forEach(prop => {
      const tagName = prop.namespace === 'DAV:' ? `D:${prop.name}` : prop.name;
      if (prop.value) {
        xml += `
        <${tagName}>${prop.value}</${tagName}>`;
      } else {
        xml += `
        <${tagName}/>`;
      }
    });

    xml += `
      </D:prop>
      <D:status>${status}</D:status>
    </D:propstat>`;
  });

  xml += `
  </D:response>`;

  return xml;
}

/**
 * Parse PROPPATCH request body
 */
export function parseProppatch(xmlBody: string): { set: WebDAVProperty[], remove: string[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlBody, 'text/xml');
  
  const set: WebDAVProperty[] = [];
  const remove: string[] = [];

  // Parse <D:set> elements
  const setElements = doc.getElementsByTagName('set');
  for (let i = 0; i < setElements.length; i++) {
    const propElements = setElements[i].getElementsByTagName('prop');
    for (let j = 0; j < propElements.length; j++) {
      const prop = propElements[j];
      for (let k = 0; k < prop.childNodes.length; k++) {
        const child = prop.childNodes[k];
        if (child.nodeType === 1) { // Element node
          const element = child as Element;
          set.push({
            namespace: element.namespaceURI || 'DAV:',
            name: element.localName || element.nodeName,
            value: element.textContent || ''
          });
        }
      }
    }
  }

  // Parse <D:remove> elements
  const removeElements = doc.getElementsByTagName('remove');
  for (let i = 0; i < removeElements.length; i++) {
    const propElements = removeElements[i].getElementsByTagName('prop');
    for (let j = 0; j < propElements.length; j++) {
      const prop = propElements[j];
      for (let k = 0; k < prop.childNodes.length; k++) {
        const child = prop.childNodes[k];
        if (child.nodeType === 1) { // Element node
          const element = child as Element;
          remove.push(element.localName || element.nodeName);
        }
      }
    }
  }

  return { set, remove };
}

/**
 * Build LOCK response XML
 */
export function buildLockResponse(lockInfo: LockInfo, path: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:${lockInfo.scope}/></D:lockscope>
      <D:depth>${lockInfo.depth}</D:depth>
      <D:owner>${escapeXML(lockInfo.owner)}</D:owner>
      <D:timeout>Second-${lockInfo.timeout}</D:timeout>
      <D:locktoken>
        <D:href>${lockInfo.token}</D:href>
      </D:locktoken>
      <D:lockroot>
        <D:href>${escapeXML(path)}</D:href>
      </D:lockroot>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`;
}

/**
 * Parse LOCK request body
 */
export function parseLockRequest(xmlBody: string): { owner: string, timeout: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlBody, 'text/xml');
  
  let owner = 'Unknown';
  let timeout = 1800; // 30 minutes default

  // Extract owner
  const ownerElements = doc.getElementsByTagName('owner');
  if (ownerElements.length > 0) {
    owner = ownerElements[0].textContent || 'Unknown';
  }

  return { owner, timeout };
}

/**
 * Format date in RFC 1123 format (required by WebDAV)
 */
export function formatRFC1123Date(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const day = days[date.getUTCDay()];
  const dayNum = date.getUTCDate().toString().padStart(2, '0');
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  
  return `${day}, ${dayNum} ${month} ${year} ${hours}:${minutes}:${seconds} GMT`;
}

/**
 * Escape XML special characters
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parse If header for conditional requests (Windows WebDAV client)
 */
export function parseIfHeader(ifHeader: string): { tokens: string[], etags: string[] } {
  const tokens: string[] = [];
  const etags: string[] = [];
  
  // Simple parsing for lock tokens and etags
  const tokenMatches = ifHeader.match(/<([^>]+)>/g);
  if (tokenMatches) {
    tokenMatches.forEach(match => {
      const token = match.slice(1, -1); // Remove < >
      if (token.startsWith('opaquelocktoken:')) {
        tokens.push(token);
      } else {
        etags.push(token);
      }
    });
  }
  
  return { tokens, etags };
}