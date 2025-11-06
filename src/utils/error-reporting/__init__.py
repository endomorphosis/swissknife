"""
Error Reporting Package
Automated error reporting system for Python runtime
"""

from .python_error_handler import (
    ErrorReport,
    GitHubIssueReporter,
    PythonErrorHandler,
)

__all__ = [
    "ErrorReport",
    "GitHubIssueReporter",
    "PythonErrorHandler",
    "initialize_error_reporting",
]


def initialize_error_reporting(config=None):
    """
    Initialize Python error reporting system

    Args:
        config: Dictionary with configuration options
            - enabled: bool - Enable error reporting
            - reporterConfig: dict - GitHub reporter configuration
                - enabled: bool
                - githubToken: str - GitHub API token
                - owner: str - Repository owner
                - repo: str - Repository name
                - labels: list - Issue labels
                - maxIssuesPerHour: int - Rate limit
                - deduplicateWindow: int - Deduplication window in ms

    Returns:
        PythonErrorHandler instance
    """
    import os

    if config is None:
        # Load configuration from environment variables
        config = {
            "enableReporting": os.environ.get("ERROR_REPORTING_ENABLED", "false").lower() == "true",
            "reporterConfig": {
                "enabled": os.environ.get("ERROR_REPORTING_ENABLED", "false").lower() == "true",
                "githubToken": os.environ.get("GITHUB_TOKEN"),
                "owner": os.environ.get("GITHUB_REPO_OWNER", "endomorphosis"),
                "repo": os.environ.get("GITHUB_REPO_NAME", "swissknife"),
                "labels": os.environ.get("ERROR_REPORTING_LABELS", "auto-generated,bug").split(","),
                "maxIssuesPerHour": int(os.environ.get("ERROR_REPORTING_MAX_ISSUES", "10")),
                "deduplicateWindow": int(os.environ.get("ERROR_REPORTING_DEDUPE_WINDOW", "3600000")),
            },
        }

    handler = PythonErrorHandler(config)

    if config.get("enableReporting", False):
        handler.install()
        print("[ErrorReporting] Python error reporting initialized")
    else:
        print("[ErrorReporting] Python error reporting is disabled")

    return handler
