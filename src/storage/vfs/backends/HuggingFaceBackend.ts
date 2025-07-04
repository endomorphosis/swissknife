/*
// src/storage/vfs/backends/HuggingFaceBackend.ts
import { HfApi, HfInference } from '@huggingface/hub';

export class HuggingFaceBackend extends StorageBackend {
  readonly name = 'huggingface';
  readonly protocol = 'hf://';
  private hfApi: HfApi;
  private hfInference: HfInference;
  private accessToken: string;

  async connect(config: HuggingFaceConfig): Promise<void> {
    this.accessToken = config.accessToken;
    this.hfApi = new HfApi({
      accessToken: this.accessToken,
      fetch: globalThis.fetch
    });
    this.hfInference = new HfInference(this.accessToken);
  }

  async write(path: string, data: Buffer): Promise<string> {
    const { repo, filePath } = this.parsePath(path);
    
    // Upload file to Hugging Face repository
    const result = await this.hfApi.uploadFile({
      repo,
      file: {
        path: filePath,
        content: data
      },
      commitTitle: `Upload ${filePath}`,
      commitDescription: 'Uploaded via SwissKnife VFS'
    });
    
    return `hf://${repo}/${filePath}@${result.commit}`;
  }

  async read(path: string): Promise<Buffer> {
    const { repo, filePath, revision } = this.parsePath(path);
    
    // Download file from Hugging Face repository
    const response = await this.hfApi.downloadFile({
      repo,
      path: filePath,
      revision
    });
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async list(path: string): Promise<BackendEntry[]> {
    const { repo, filePath } = this.parsePath(path);
    
    const files = await this.hfApi.listFiles({
      repo,
      path: filePath || '',
      recursive: false
    });
    
    return files.map(file => ({
      name: file.path.split('/').pop() || file.path,
      path: `/hf/${repo}/${file.path}`,
      isDirectory: file.type === 'directory',
      size: file.size,
      modified: file.lastModified,
      backend: 'huggingface',
      metadata: {
        sha: file.oid,
        lfsFile: file.lfs?.oid ? true : false
      }
    }));
  }

  // Hugging Face-specific methods
  async listRepositories(user?: string): Promise<RepoInfo[]> {
    return await this.hfApi.listRepos({
      search: user ? { owner: user } : undefined
    });
  }

  async createRepository(name: string, options: CreateRepoOptions): Promise<RepoInfo> {
    return await this.hfApi.createRepo({
      name,
      type: options.type || 'model',
      private: options.private || false,
      sdk: options.sdk || 'transformers'
    });
  }

  async searchModels(query: string): Promise<ModelInfo[]> {
    return await this.hfApi.listModels({
      search: query,
      limit: 20
    });
  }

  async searchDatasets(query: string): Promise<DatasetInfo[]> {
    return await this.hfApi.listDatasets({
      search: query,
      limit: 20
    });
  }

  async getModelInfo(modelId: string): Promise<ModelInfo> {
    return await this.hfApi.model(modelId);
  }

  async getDatasetInfo(datasetId: string): Promise<DatasetInfo> {
    return await this.hfApi.dataset(datasetId);
  }

  async runInference(modelId: string, inputs: any): Promise<any> {
    // Use HfInference for running models
    const model = this.hfInference.endpoint(modelId);
    return await model(inputs);
  }

  async uploadModel(modelPath: string, config: UploadModelConfig): Promise<string> {
    const result = await this.hfApi.uploadFile({
      repo: config.repo,
      file: {
        path: 'pytorch_model.bin',
        content: await this.readLocalFile(modelPath)
      },
      commitTitle: 'Upload model via SwissKnife VFS'
    });
    
    return `hf://${config.repo}/pytorch_model.bin@${result.commit}`;
  }

  async downloadModel(modelId: string, localPath: string): Promise<void> {
    const files = await this.hfApi.listFiles({ repo: modelId });
    
    for (const file of files) {
      if (file.type === 'file') {
        const content = await this.read(`/hf/${modelId}/${file.path}`);
        await this.writeLocalFile(`${localPath}/${file.path}`, content);
      }
    }
  }

  private parsePath(path: string): { repo: string, filePath: string, revision?: string } {
    // Parse paths like /hf/microsoft/DialoGPT-medium/pytorch_model.bin@main
    const match = path.match(/^\/hf\/([^\/]+\/[^\/]+)\/(.+?)(?:@([^\/]+))?$/);
    if (!match) {
      throw new Error(`Invalid Hugging Face path: ${path}`);
    }
    
    return {
      repo: match[1],
      filePath: match[2],
      revision: match[3] || 'main'
    };
  }

  private async readLocalFile(path: string): Promise<Buffer> {
    // Implementation depends on environment (Node.js vs browser)
    throw new Error('Local file reading not implemented');
  }

  private async writeLocalFile(path: string, data: Buffer): Promise<void> {
    // Implementation depends on environment (Node.js vs browser)
    throw new Error('Local file writing not implemented');
  }
}
*/