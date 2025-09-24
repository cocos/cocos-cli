declare module 'xhr2' {
    class XMLHttpRequest {
      open(method: string, url: string, async?: boolean): void;
      send(data?: any): void;
      setRequestHeader(header: string, value: string): void;
      
      readonly readyState: number;
      readonly status: number;
      readonly statusText: string;
      readonly responseText: string;
      readonly response: any;
      
      onreadystatechange: (() => void) | null;
      onload: (() => void) | null;
      onerror: (() => void) | null;
    }
    
    export = XMLHttpRequest;
  }