export interface CommandResult {
    success: boolean;
    output?: string;
    error?: string;
    exitCode: number;
}
