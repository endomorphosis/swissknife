"""
Docker Container Error Reporting Integration Example

This file demonstrates how to integrate error reporting with Python code
running in the Docker container.

Add this code to your Python application entry point to enable automatic error reporting.
"""

import os
import sys

# Add parent directory to path if needed
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.utils.error_reporting import initialize_error_reporting


def initialize_docker_error_reporting():
    """
    Initialize error reporting for Docker container Python processes
    
    Environment variables:
        ERROR_REPORTING_ENABLED: Enable error reporting (true/false)
        GITHUB_TOKEN: GitHub personal access token
        GITHUB_REPO_OWNER: Repository owner
        GITHUB_REPO_NAME: Repository name
        ERROR_REPORTING_LABELS: Comma-separated list of labels
        ERROR_REPORTING_MAX_ISSUES: Maximum issues per hour
        ERROR_REPORTING_DEDUPE_WINDOW: Deduplication window in milliseconds
    """
    reporting_enabled = os.environ.get('ERROR_REPORTING_ENABLED', 'false').lower() == 'true'

    # Load configuration from environment. Invalid values should fail startup
    # visibly; treating them as "not initialized" hides Docker configuration bugs.
    config = {
        'enableReporting': reporting_enabled,
        'reporterConfig': {
            'enabled': reporting_enabled,
            'githubToken': os.environ.get('GITHUB_TOKEN'),
            'owner': os.environ.get('GITHUB_REPO_OWNER', 'endomorphosis'),
            'repo': os.environ.get('GITHUB_REPO_NAME', 'swissknife'),
            'labels': os.environ.get('ERROR_REPORTING_LABELS', 'auto-generated,bug,docker').split(','),
            'maxIssuesPerHour': _env_int('ERROR_REPORTING_MAX_ISSUES', 10),
            'deduplicateWindow': _env_int('ERROR_REPORTING_DEDUPE_WINDOW', 3600000),
        }
    }

    # Initialize error handler
    error_handler = initialize_error_reporting(config)

    if config['enableReporting']:
        print('[Docker Container] Error reporting enabled - errors will be automatically reported to GitHub')
    else:
        print('[Docker Container] Error reporting disabled - set ERROR_REPORTING_ENABLED=true to enable')

    return error_handler


def _env_int(name, default):
    """Read an integer environment variable with a targeted error message."""
    value = os.environ.get(name)
    if value is None:
        return default

    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f'{name} must be an integer, got {value!r}') from exc


def report_docker_error(error, context=None):
    """
    Manually report an error from Docker container
    
    Args:
        error: Exception object
        context: Dictionary with additional context
            - component: Component name
            - severity: Error severity (critical, high, medium, low)
            - operation: Operation being performed
            - containerInfo: Docker container information
            - Any other custom fields
    
    Example:
        try:
            # Your code
            pass
        except Exception as e:
            report_docker_error(e, {
                'component': 'data-processor',
                'severity': 'high',
                'operation': 'image-processing',
                'containerInfo': {
                    'id': container_id,
                    'image': container_image
                }
            })
    """
    error_handler = initialize_docker_error_reporting()
    
    if not error_handler:
        print('[Docker Container] Error reporting not initialized')
        return

    if context is None:
        context = {}
    
    # Add Docker-specific context
    context.setdefault('component', 'docker-container')
    context.setdefault('runtime', 'python')
    context.setdefault('containerInfo', {
        'hostname': os.environ.get('HOSTNAME', 'unknown'),
        'pythonVersion': sys.version,
    })

    error_handler.report_error(error, context=context)


# Example usage:
if __name__ == '__main__':
    """
    Example usage in Docker container Python code:
    
    # At application startup:
    from examples.docker_error_reporting_integration import initialize_docker_error_reporting
    
    error_handler = initialize_docker_error_reporting()
    
    # In error handlers:
    from examples.docker_error_reporting_integration import report_docker_error
    
    try:
        # Your application code
        result = process_data()
    except Exception as e:
        report_docker_error(e, {
            'component': 'data-processor',
            'severity': 'critical',
            'operation': 'data-processing',
            'inputData': data_summary
        })
        raise  # Re-raise if needed
    """
    
    # Example: Initialize and test error reporting
    error_handler = initialize_docker_error_reporting()
    
    # Example: Create a test error (don't do this in production!)
    # try:
    #     raise ValueError("Test error from Docker container")
    # except Exception as e:
    #     report_docker_error(e, {
    #         'component': 'test',
    #         'severity': 'low',
    #         'operation': 'testing'
    #     })
