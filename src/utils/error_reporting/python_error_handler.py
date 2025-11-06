"""
Python Error Handler
Captures and reports Python runtime errors to GitHub
"""

import sys
import traceback
import json
import os
from typing import Optional, Dict, Any, Callable
from datetime import datetime
import requests


class ErrorReport:
    """Error report data structure"""

    def __init__(
        self,
        title: str,
        error: Exception,
        context: Optional[Dict[str, Any]] = None,
        severity: str = "medium",
    ):
        self.title = title
        self.error = error
        self.context = context or {}
        self.severity = severity

    def to_dict(self) -> Dict[str, Any]:
        """Convert error report to dictionary"""
        return {
            "title": self.title,
            "error": {
                "name": type(self.error).__name__,
                "message": str(self.error),
                "traceback": traceback.format_exc(),
            },
            "context": self.context,
            "severity": self.severity,
        }


class GitHubIssueReporter:
    """GitHub issue reporter for Python errors"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.enabled = config.get("enabled", False)
        self.github_token = config.get("githubToken") or os.environ.get("GITHUB_TOKEN")
        self.owner = config.get("owner", "endomorphosis")
        self.repo = config.get("repo", "swissknife")
        self.labels = config.get("labels", [])
        self.max_issues_per_hour = config.get("maxIssuesPerHour", 10)
        self.deduplicate_window = config.get("deduplicateWindow", 3600000)  # 1 hour in ms

        self.recent_errors: Dict[str, float] = {}
        self.issue_count = 0
        self.issue_reset_time = datetime.now().timestamp() + 3600

    def report_error(self, report: ErrorReport) -> bool:
        """Report an error and create a GitHub issue"""
        if not self.enabled:
            print("[ErrorReporter] Error reporting is disabled")
            return False

        if not self.github_token:
            print("[ErrorReporter] GitHub token not configured")
            return False

        # Check rate limiting
        if not self._check_rate_limit():
            print("[ErrorReporter] Rate limit exceeded")
            return False

        # Check for duplicates
        if self._is_duplicate(report):
            print("[ErrorReporter] Duplicate error, skipping")
            return False

        try:
            # Create GitHub issue
            issue_number = self._create_issue(report)
            print(f"[ErrorReporter] Created issue #{issue_number}")

            # Track this error
            self._track_error(report)

            return True
        except Exception as e:
            print(f"[ErrorReporter] Failed to create issue: {e}")
            return False

    def _create_issue(self, report: ErrorReport) -> int:
        """Create a GitHub issue from error report"""
        title = self._format_issue_title(report)
        body = self._format_issue_body(report)
        labels = self._get_issue_labels(report)

        url = f"https://api.github.com/repos/{self.owner}/{self.repo}/issues"
        headers = {
            "Authorization": f"token {self.github_token}",
            "Accept": "application/vnd.github.v3+json",
        }

        data = {"title": title, "body": body, "labels": labels}

        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()

        return response.json()["number"]

    def _format_issue_title(self, report: ErrorReport) -> str:
        """Format issue title"""
        prefix = f"[{report.severity.upper()}]"
        runtime = "[python]"
        component = f"{report.context.get('component', '')}: " if report.context.get("component") else ""

        return f"{prefix}{runtime} {component}{report.title}"

    def _format_issue_body(self, report: ErrorReport) -> str:
        """Format issue body with error details"""
        sections = []

        # Error description
        sections.append("## Error Description")
        sections.append(str(report.error))
        sections.append("")

        # Error details
        sections.append("## Error Details")
        sections.append("```")
        sections.append(f"Name: {type(report.error).__name__}")
        sections.append(f"Message: {str(report.error)}")

        if report.context.get("timestamp"):
            sections.append(f"Timestamp: {report.context['timestamp']}")
        if report.context.get("component"):
            sections.append(f"Component: {report.context['component']}")
        if report.context.get("runtime"):
            sections.append(f"Runtime: {report.context['runtime']}")

        sections.append("```")
        sections.append("")

        # Stack trace
        traceback_text = report.error.__traceback__ if hasattr(report.error, "__traceback__") else None
        if traceback_text or report.context.get("stackTrace"):
            sections.append("## Stack Trace")
            sections.append("```python")
            sections.append(report.context.get("stackTrace", traceback.format_exc()))
            sections.append("```")
            sections.append("")

        # Additional context
        if report.context:
            additional = {
                k: v
                for k, v in report.context.items()
                if k not in ["component", "runtime", "timestamp", "stackTrace"]
            }
            if additional:
                sections.append("## Additional Context")
                for key, value in additional.items():
                    sections.append(f"- **{key}**: {json.dumps(value)}")
                sections.append("")

        # Metadata
        sections.append("---")
        sections.append("*This issue was automatically generated by the SwissKnife error reporting system.*")

        return "\n".join(sections)

    def _get_issue_labels(self, report: ErrorReport) -> list:
        """Get appropriate labels for the issue"""
        labels = list(self.labels)

        # Add severity label
        labels.append(f"severity:{report.severity}")

        # Add runtime label
        if report.context.get("runtime"):
            labels.append(f"runtime:{report.context['runtime']}")

        # Add component label
        if report.context.get("component"):
            labels.append(f"component:{report.context['component']}")

        # Always add auto-generated label
        labels.extend(["auto-generated", "bug"])

        return labels

    def _is_duplicate(self, report: ErrorReport) -> bool:
        """Check if error is duplicate"""
        error_key = self._get_error_key(report)
        last_reported = self.recent_errors.get(error_key)

        if not last_reported:
            return False

        time_since_last = (datetime.now().timestamp() - last_reported) * 1000  # Convert to ms
        return time_since_last < self.deduplicate_window

    def _track_error(self, report: ErrorReport) -> None:
        """Track error to prevent duplicates"""
        error_key = self._get_error_key(report)
        self.recent_errors[error_key] = datetime.now().timestamp()

        # Clean up old entries
        self._cleanup_old_errors()

    def _get_error_key(self, report: ErrorReport) -> str:
        """Generate unique key for error"""
        parts = [
            type(report.error).__name__,
            str(report.error),
            report.context.get("component", "unknown"),
            report.context.get("runtime", "unknown"),
        ]
        return "::".join(parts)

    def _cleanup_old_errors(self) -> None:
        """Clean up old error tracking entries"""
        now = datetime.now().timestamp()
        cutoff = now - (self.deduplicate_window / 1000)  # Convert ms to seconds

        self.recent_errors = {k: v for k, v in self.recent_errors.items() if v >= cutoff}

    def _check_rate_limit(self) -> bool:
        """Check rate limiting"""
        now = datetime.now().timestamp()

        # Reset counter if time window has passed
        if now > self.issue_reset_time:
            self.issue_count = 0
            self.issue_reset_time = now + 3600

        # Check if we've exceeded the limit
        if self.issue_count >= self.max_issues_per_hour:
            return False

        # Increment counter
        self.issue_count += 1
        return True


class PythonErrorHandler:
    """Python error handler that reports errors to GitHub"""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.reporter: Optional[GitHubIssueReporter] = None
        self.on_error: Optional[Callable] = config.get("onError")
        self.original_excepthook = None

        if config.get("reporter"):
            self.reporter = config["reporter"]
        elif config.get("enableReporting", True):
            self.reporter = GitHubIssueReporter(config.get("reporterConfig", {}))

    def install(self) -> None:
        """Install global exception handler"""
        self.original_excepthook = sys.excepthook
        sys.excepthook = self._exception_handler
        print("[PythonErrorHandler] Error handler installed")

    def uninstall(self) -> None:
        """Uninstall global exception handler"""
        if self.original_excepthook:
            sys.excepthook = self.original_excepthook
            self.original_excepthook = None
        print("[PythonErrorHandler] Error handler uninstalled")

    def _exception_handler(self, exc_type, exc_value, exc_traceback):
        """Global exception handler"""
        # Don't catch KeyboardInterrupt
        if issubclass(exc_type, KeyboardInterrupt):
            if self.original_excepthook:
                self.original_excepthook(exc_type, exc_value, exc_traceback)
            return

        print(f"[PythonErrorHandler] Uncaught Exception: {exc_value}")

        # Create error report
        report = ErrorReport(
            title=f"Uncaught Exception: {str(exc_value)}",
            error=exc_value,
            context={
                "component": "global",
                "runtime": "python",
                "timestamp": datetime.now().isoformat(),
                "stackTrace": "".join(traceback.format_exception(exc_type, exc_value, exc_traceback)),
                "pythonVersion": sys.version,
                "platform": sys.platform,
            },
            severity="critical",
        )

        # Report error
        if self.reporter:
            try:
                self.reporter.report_error(report)
            except Exception as e:
                print(f"[PythonErrorHandler] Failed to report error: {e}")

        # Call custom handler
        if self.on_error:
            self.on_error(exc_value, report.context)

        # Call original exception handler
        if self.original_excepthook:
            self.original_excepthook(exc_type, exc_value, exc_traceback)

    def report_error(self, error: Exception, context: Optional[Dict[str, Any]] = None) -> None:
        """Manually report an error"""
        if not self.reporter:
            return

        report = ErrorReport(
            title=str(error),
            error=error,
            context={
                "runtime": "python",
                "timestamp": datetime.now().isoformat(),
                "stackTrace": traceback.format_exc(),
                **(context or {}),
            },
            severity=context.get("severity", "medium") if context else "medium",
        )

        try:
            self.reporter.report_error(report)
        except Exception as e:
            print(f"[PythonErrorHandler] Failed to report error: {e}")

    def create_error_report(
        self, error: Exception, component: str = None, severity: str = "medium", **context
    ) -> ErrorReport:
        """Create error report from exception"""
        return ErrorReport(
            title=str(error),
            error=error,
            context={
                "component": component,
                "runtime": "python",
                "timestamp": datetime.now().isoformat(),
                "stackTrace": traceback.format_exc(),
                **context,
            },
            severity=severity,
        )
