#!/usr/bin/env python3
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).with_name('to_md.py')
spec = importlib.util.spec_from_file_location('to_md', SCRIPT)
to_md = importlib.util.module_from_spec(spec)
spec.loader.exec_module(to_md)


class MarkdownPipeTableTests(unittest.TestCase):
    def test_markdown_separator_alignment_is_preserved(self):
        source = """| Repo | PRs | Notes |
| --- | ---: | --- |
| shop/world | 3 | monorepo |
"""
        result = subprocess.run(
            [sys.executable, str(SCRIPT)],
            input=source,
            text=True,
            capture_output=True,
            check=True,
        )

        self.assertIn('| :--- | ---: | :--- |', result.stdout)

    def test_markdown_separator_row_is_not_rendered_as_body(self):
        source = """| Repo | PRs | Notes |
| --- | ---: | --- |
| shop/world | 3 | monorepo |
| extensibility | 2 | packages |
"""
        tables = to_md.extract_tables(source)
        self.assertEqual(len(tables), 1)

        header, body = to_md.parse_table(tables[0], assume_header=True)
        rendered = to_md.render_markdown(header, body)

        self.assertEqual(body[0], ['shop/world', '3', 'monorepo'])
        self.assertNotIn('| --- | ---: | --- |', rendered)


class PiSessionDiscoveryTests(unittest.TestCase):
    def test_from_pi_session_fails_closed_when_owner_cannot_be_identified(self):
        with tempfile.TemporaryDirectory() as tmp:
            session_dir = Path(tmp) / '--Users-h--'
            session_dir.mkdir()
            session_file = session_dir / '2026-05-30T00-00-00-000Z_fake.jsonl'
            session_file.write_text(
                json.dumps({
                    'type': 'message',
                    'message': {
                        'role': 'toolResult',
                        'content': [{'type': 'text', 'text': '+---+---+\n| A | B |\n+---+---+'}],
                    },
                }) + '\n',
                encoding='utf-8',
            )

            old_env = os.environ.get('PI_SESSIONS_DIR')
            os.environ['PI_SESSIONS_DIR'] = tmp
            try:
                stderr = io.StringIO()
                with mock.patch.object(to_md, '_find_owning_pi_jsonl', return_value=None):
                    with contextlib.redirect_stderr(stderr):
                        with self.assertRaises(SystemExit) as raised:
                            to_md.read_pi_session()
                self.assertEqual(raised.exception.code, 1)
                self.assertIn('could not identify owning pi session', stderr.getvalue())
            finally:
                if old_env is None:
                    os.environ.pop('PI_SESSIONS_DIR', None)
                else:
                    os.environ['PI_SESSIONS_DIR'] = old_env


if __name__ == '__main__':
    unittest.main()
