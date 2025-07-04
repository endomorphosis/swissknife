// web/src/apps/IPFSBrowser.ts
export class IPFSBrowserApp {
  private ipfsClient: IPFSClient;
  private contentCache: Map<string, any> = new Map();

  async browseContent(cid: string): Promise<IPFSContent> {
    if (this.contentCache.has(cid)) {
      return this.contentCache.get(cid);
    }
    
    const content = await this.ipfsClient.get(cid);
    this.contentCache.set(cid, content);
    return content;
  }

  async uploadContent(file: File): Promise<string> {
    const result = await this.ipfsClient.add(file);
    this.refreshContentList();
    return result.cid;
  }
}