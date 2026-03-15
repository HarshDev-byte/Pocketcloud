declare module 'multicast-dns' {
  interface MDNSQuery {
    name: string;
    type: string;
  }

  interface MDNSAnswer {
    name: string;
    type: string;
    data: string;
    ttl?: number;
  }

  interface MDNSResponse {
    questions: MDNSQuery[];
    answers: MDNSAnswer[];
    authorities: MDNSAnswer[];
    additionals: MDNSAnswer[];
  }

  interface MDNS {
    query(name: string, type?: string): void;
    query(queries: MDNSQuery[]): void;
    respond(answers: MDNSAnswer[]): void;
    on(event: 'query', listener: (query: MDNSResponse) => void): this;
    on(event: 'response', listener: (response: MDNSResponse) => void): this;
    destroy(): void;
  }

  interface MDNSOptions {
    port?: number;
    multicast?: boolean;
    interface?: string;
    ttl?: number;
    loopback?: boolean;
    reuseAddr?: boolean;
  }

  function createMDNS(options?: MDNSOptions): MDNS;
  export = createMDNS;
}