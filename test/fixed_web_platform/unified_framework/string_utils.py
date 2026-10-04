#!/usr/bin/env python3
"""
String Utility Functions for IPFS Accelerate Python Framework

This module provides standardized string handling utilities, including:
- String escape sequence fixes and validation
- Proper handling of raw strings for regex patterns
- Input validation for string parameters
- Utilities for safe string operations
"""

import re
import os
import json
import logging
from typing import List, Dict, Any, Optional, Union, Pattern, Match, Tuple

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def fix_escapes(s: str) -> str:
    """
    Fix improper escape sequences in a string.
    
    This function identifies and fixes common escape sequence issues:
    - Replacing Windows backslashes with forward slashes in paths
    - Fixing double escaping (\\ -> \)
    - Correcting escaped quotes
    - Handling raw string indicators
    
    Args:
        s: String with potential escape sequence issues
        
    Returns:
        Fixed string with proper escape sequences
    """
    if not s:
        return s
        
    # Series of fixes
    
    # 1. Fix Windows paths by converting to forward slashes
    # Heuristic: If the string contains : followed by backslash (like C:\), 
    # it's likely a Windows path
    if re.search(r'[a-zA-Z]:\\', s):
        s = s.replace('\\', '/')
        
    # 2. Fix double escaping (e.g., in JSON strings)
    # Common patterns: \\n, \\t, \\r, \\"
    # Replace common double-escaped characters 
    if '\\\\' in s:
        # Only fix if not in a raw string context (r"...")
        if not (s.startswith('r"') or s.startswith("r'")):
            double_escapes = {
                '\\\\n': '\\n',  # \\n -> \n
                '\\\\t': '\\t',  # \\t -> \t
                '\\\\r': '\\r',  # \\r -> \r
                '\\\\"': '\\"',  # \\" -> \"
                "\\\\'": "\\'",  # \\' -> \'
            }
            for escaped, fixed in double_escapes.items():
                if escaped in s:
                    s = s.replace(escaped, fixed)
        
    # 3. Special case handling for JSON strings that need to be interpreted
    if (s.startswith('{') and s.endswith('}')) or (s.startswith('[') and s.endswith(']')):
        try:
            # Try to parse and re-encode to normalize escaping
            parsed = json.loads(s.replace("'", '"'))
            s = json.dumps(parsed)
        except (json.JSONDecodeError, TypeError):
            # Not a JSON string, leave it alone
            pass
    
    return s


def is_valid_regex(pattern: str) -> bool:
    """
    Check if a string is a valid regular expression pattern.
    
    Args:
        pattern: Regular expression pattern to validate
        
    Returns:
        True if valid, False otherwise
    """
    try:
        re.compile(pattern)
        return True
    except re.error:
        return False


def use_raw_string_for_regex(pattern: str) -> str:
    """
    Convert a regular expression pattern to use raw string syntax.
    
    This helps avoid escape sequence issues in regex patterns by using
    the 'r' prefix (e.g., r"\d+" instead of "\\d+").
    
    Args:
        pattern: Regular expression pattern
        
    Returns:
        Equivalent pattern using raw string syntax
    """
    if not pattern:
        return pattern
        
    # Check if already a raw string
    if pattern.startswith('r"') or pattern.startswith("r'"):
        return pattern
        
    # Count the number of backslashes - high count indicates need for raw string
    backslash_count = pattern.count('\\')
    if backslash_count == 0:
        return pattern
        
    # Check if this is a regex pattern with common metacharacters
    regex_metacharacters = ['\\d', '\\w', '\\s', '\\b', '\\n', '\\t', '\\r', '\\[', '\\]', '\\(', '\\)']
    has_regex_metacharacters = any(meta in pattern for meta in regex_metacharacters)
    
    if has_regex_metacharacters or backslash_count > 1:
        # Convert to raw string
        quote_char = '"' if "'" in pattern else "'"
        if quote_char == "'":
            # For single quotes, replace any internal single quotes with escaped version
            pattern = pattern.replace("'", "\\'")
            return f"r'{pattern}'"
        else:
            # For double quotes, replace any internal double quotes with escaped version
            pattern = pattern.replace('"', '\\"')
            return f'r"{pattern}"'
    
    return pattern


def has_escape_issues(s: str) -> bool:
    """
    Check if a string has potential escape sequence issues.
    
    Args:
        s: String to check
        
    Returns:
        True if string has potential escape issues, False otherwise
    """
    if not s:
        return False
        
    # Check for patterns that suggest escape issues
    patterns = [
        r'\\[^\\ntr\'"abfv]',  # Backslash followed by character that's not a common escape
        r'\\\\[ntr\'"abfv]',   # Double backslash followed by common escape character
        r'[^r]"\\[^\\ntr\'"abfv]',  # Non-raw string with unusual escape sequence
    ]
    
    return any(re.search(pattern, s) is not None for pattern in patterns)


def fix_shebang_line(line: str) -> str:
    """
    Fix common issues with shebang lines.
    
    Args:
        line: First line of a Python script
        
    Returns:
        Fixed shebang line if needed, otherwise original line
    """
    if not line.startswith('#!'):
        return line
        
    # Common shebang issues:
    # 1. Using "python" instead of "python3"
    # 2. Using Windows-style paths
    # 3. Missing /usr/bin prefix
    
    # Fix Windows-style paths
    line = line.replace('\\', '/')
    
    # Check for environment-based shebang (#!/usr/bin/env)
    if 'env' in line:
        # If using just "python", update to "python3"
        if re.search(r'env\s+python(\s|$)', line):
            line = line.replace('env python', 'env python3')
    else:
        # Direct path to python
        if '/python ' in line or line.endswith('/python'):
            line = line.replace('/python', '/python3')
        
        # Check if path looks valid
        if not ('/bin/' in line or '/usr/' in line):
            # Use standardized path with env
            line = '#!/usr/bin/env python3'
    
    return line


def validate_string_input(s: str, 
                         min_length: Optional[int] = None, 
                         max_length: Optional[int] = None, 
                         pattern: Optional[str] = None,
                         allowed_values: Optional[List[str]] = None) -> Tuple[bool, Optional[str]]:
    """
    Validate a string input against various constraints.
    
    Args:
        s: String to validate
        min_length: Minimum allowed length
        max_length: Maximum allowed length
        pattern: Regular expression pattern to match
        allowed_values: List of allowed values
        
    Returns:
        Tuple of (bool: is valid, str: error message if invalid)
    """
    if s is None:
        return False, "String input is None"
        
    if not isinstance(s, str):
        return False, f"Input is not a string (got {type(s).__name__})"
        
    # Check length constraints
    if min_length is not None and len(s) < min_length:
        return False, f"String length ({len(s)}) is less than minimum ({min_length})"
        
    if max_length is not None and len(s) > max_length:
        return False, f"String length ({len(s)}) exceeds maximum ({max_length})"
        
    # Check pattern match
    if pattern is not None:
        try:
            if not re.match(pattern, s):
                return False, f"String does not match required pattern: {pattern}"
        except re.error as e:
            return False, f"Invalid regex pattern: {str(e)}"
        
    # Check allowed values
    if allowed_values is not None and s not in allowed_values:
        values_str = ", ".join(repr(v) for v in allowed_values[:5])
        if len(allowed_values) > 5:
            values_str += f", ... ({len(allowed_values) - 5} more)"
        return False, f"String '{s}' is not one of the allowed values: {values_str}"
        
    return True, None


def safe_format(template: str, *args, **kwargs) -> str:
    """
    Safely format a string template with args and kwargs.
    
    This function prevents common string formatting issues like
    KeyError or IndexError with a fallback mechanism.
    
    Args:
        template: String template
        *args: Positional arguments for formatting
        **kwargs: Keyword arguments for formatting
        
    Returns:
        Formatted string
    """
    try:
        return template.format(*args, **kwargs)
    except (KeyError, IndexError) as e:
        logger.warning(f"String formatting error: {e}")
        # Fall back to safer format
        safe_template = re.sub(r'\{[^}]*\}', '{}', template)
        combined_args = list(args) + list(kwargs.values())
        try:
            return safe_template.format(*combined_args)
        except:
            # Last resort fallback
            return template


def clean_docstring(docstring: str) -> str:
    """
    Clean a docstring by fixing indentation and escape issues.
    
    Args:
        docstring: Original docstring
        
    Returns:
        Cleaned docstring
    """
    if not docstring:
        return ""
        
    # Fix basic indentation
    lines = docstring.expandtabs().splitlines()
    
    # Remove empty lines from the beginning and end
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
        
    # Find minimum indentation
    indent = float('inf')
    for line in lines:
        stripped = line.lstrip()
        if stripped:
            indent = min(indent, len(line) - len(stripped))
    
    if indent == float('inf'):
        indent = 0
        
    # Remove indentation
    cleaned_lines = [line[indent:] for line in lines]
    
    # Join lines and fix escape sequences
    cleaned = '\n'.join(cleaned_lines)
    cleaned = fix_escapes(cleaned)
    
    return cleaned


def generate_safe_filename(base_name: str, extension: str = '.txt', 
                          max_length: int = 255) -> str:
    """
    Generate a safe filename from a string.
    
    This function removes or replaces characters that are invalid in filenames.
    
    Args:
        base_name: Base name for the filename
        extension: File extension (including dot)
        max_length: Maximum length for filename
        
    Returns:
        Safe filename
    """
    # Remove invalid characters
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', base_name)
    
    # Ensure extension starts with dot
    if extension and not extension.startswith('.'):
        extension = '.' + extension
        
    # Calculate maximum length for base name
    max_base_length = max_length - len(extension)
    
    # Truncate if needed
    if len(safe_name) > max_base_length:
        safe_name = safe_name[:max_base_length]
        
    # Ensure not ending with space or dot
    safe_name = safe_name.rstrip('. ')
    
    # Add extension
    safe_name += extension
    
    return safe_name


def find_escaped_strings(file_path: str) -> List[Tuple[int, str, str]]:
    """
    Find potentially problematic escape sequences in a file.
    
    This function scans a Python file for strings that might have
    escape sequence issues and could benefit from using raw strings.
    
    Args:
        file_path: Path to Python file to scan
        
    Returns:
        List of tuples (line_number, original_string, suggested_fix)
    """
    if not os.path.exists(file_path):
        logger.error(f"File not found: {file_path}")
        return []
        
    issues = []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        # Regex pattern to find string literals
        string_pattern = re.compile(r'([\'"])(.*?(?<!\\)(?:\\\\)*)\1')
        
        for line_num, line in enumerate(lines, 1):
            # Skip comments
            if line.lstrip().startswith('#'):
                continue
                
            # Find all string literals in the line
            for match in string_pattern.finditer(line):
                quote, content = match.groups()
                
                # Check if this is a raw string
                is_raw = line[match.start()-1:match.start()] == 'r' if match.start() > 0 else False
                
                # Skip if already a raw string
                if is_raw:
                    continue
                    
                # Check for potential regex patterns
                has_regex_chars = re.search(r'\\[dws]|\[\^?.+?\]|\(\?:.+?\)', content) is not None
                
                # Check for multiple backslashes
                has_multiple_backslashes = content.count('\\') > 1
                
                # Check for unusual escape sequences
                has_unusual_escapes = re.search(r'\\[^\\ntr\'"abfvx0-9]', content) is not None
                
                if (has_regex_chars or has_multiple_backslashes or has_unusual_escapes) and not is_raw:
                    # Generate suggested fix
                    suggested_fix = f'r{quote}{content}{quote}'
                    
                    # Record issue
                    issues.append((line_num, f'{quote}{content}{quote}', suggested_fix))
        
        return issues
        
    except Exception as e:
        logger.error(f"Error scanning file {file_path}: {e}")
        return []


def fix_escaped_strings_in_file(file_path: str, backup: bool = True) -> Tuple[int, List[Tuple[int, str, str]]]:
    """
    Fix escaped strings in a Python file.
    
    Args:
        file_path: Path to Python file to fix
        backup: Whether to create a backup of the original file
        
    Returns:
        Tuple of (count of fixed issues, list of fixed issues)
    """
    if not os.path.exists(file_path):
        logger.error(f"File not found: {file_path}")
        return 0, []
        
    # Find issues
    issues = find_escaped_strings(file_path)
    
    if not issues:
        logger.info(f"No escape sequence issues found in {file_path}")
        return 0, []
        
    try:
        # Read file content
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Create backup if requested
        if backup:
            backup_path = f"{file_path}.bak"
            with open(backup_path, 'w', encoding='utf-8') as f:
                f.write(content)
            logger.info(f"Created backup at {backup_path}")
            
        # Apply fixes
        fixed_content = content
        for line_num, original, fix in issues:
            if original in fixed_content:
                fixed_content = fixed_content.replace(original, fix)
                
        # Write fixed content
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
            
        logger.info(f"Fixed {len(issues)} escape sequence issues in {file_path}")
        return len(issues), issues
        
    except Exception as e:
        logger.error(f"Error fixing file {file_path}: {e}")
        return 0, []


def batch_fix_escaped_strings(directory: str, file_pattern: str = "**/*.py", 
                             recursive: bool = True, backup: bool = True) -> Dict[str, int]:
    """
    Fix escaped strings in multiple Python files.
    
    Args:
        directory: Directory to scan
        file_pattern: Glob pattern for files to process
        recursive: Whether to search recursively
        backup: Whether to create backups of original files
        
    Returns:
        Dictionary mapping file paths to count of fixed issues
    """
    import glob
    
    if not os.path.isdir(directory):
        logger.error(f"Directory not found: {directory}")
        return {}
        
    # Find Python files to process
    if recursive:
        match_pattern = os.path.join(directory, file_pattern)
        files = glob.glob(match_pattern, recursive=True)
    else:
        match_pattern = os.path.join(directory, "*.py")
        files = glob.glob(match_pattern)
        
    if not files:
        logger.info(f"No Python files found matching pattern {match_pattern}")
        return {}
        
    logger.info(f"Found {len(files)} Python files to process")
    
    # Process each file
    results = {}
    for file_path in files:
        fixed_count, _ = fix_escaped_strings_in_file(file_path, backup=backup)
        if fixed_count > 0:
            results[file_path] = fixed_count
            
    # Log summary
    total_fixed = sum(results.values())
    logger.info(f"Fixed {total_fixed} escape sequence issues in {len(results)} files")
    
    return results


# Example usage
if __name__ == "__main__":
    # Example of fixing escape sequences
    test_strings = [
        r"C:\\Users\\test\\file.txt",
        "path\\to\\file",
        "regex pattern: \\d+\\w+",
        "\\\\server\\share\\file.txt",
        "He said: \"Hello world\"",
        r"Raw string: \d+\w+"
    ]
    
    print("Fix escape sequences:")
    for s in test_strings:
        fixed = fix_escapes(s)
        print(f"Original: {s}")
        print(f"Fixed:    {fixed}")
        print()
        
    # Example of converting to raw strings for regex
    regex_patterns = [
        "\\d+\\w+",
        "\\s*[a-zA-Z]+\\s*",
        "\\b\\w{3,}\\b",
        r"\d+\w+"  # Already a raw string
    ]
    
    print("\nConvert to raw strings for regex:")
    for pattern in regex_patterns:
        raw = use_raw_string_for_regex(pattern)
        print(f"Original: {pattern}")
        print(f"Raw:      {raw}")
        print(f"Is valid regex: {is_valid_regex(eval(raw))}")
        print()
        
    # Example of string validation
    test_inputs = [
        "short",
        "This is a longer string with spaces",
        "123-456-7890",
        "invalid@email",
        "valid@example.com"
    ]
    
    print("\nValidate string inputs:")
    for input_str in test_inputs:
        # Validate length
        valid, error = validate_string_input(input_str, min_length=5, max_length=50)
        print(f"Input: {input_str}")
        print(f"Length validation: {'✓ Valid' if valid else f'✗ Invalid - {error}'}")
        
        # Validate pattern (email)
        valid, error = validate_string_input(input_str, pattern=r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$')
        print(f"Email validation: {'✓ Valid' if valid else f'✗ Invalid - {error}'}")
        print()