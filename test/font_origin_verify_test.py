import hashlib
import io
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from font_origin_verify import verify_stream, source_url

class OriginVerificationTest(unittest.TestCase):
    def test_exact_sha_and_size(self):
        data = b'synthetic font'
        record = {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
                  'git_blob_sha1':hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()}
        self.assertTrue(verify_stream(io.BytesIO(data),record))
        self.assertFalse(verify_stream(io.BytesIO(b'synthetic Font'),record))
        self.assertFalse(verify_stream(io.BytesIO(data+b'x'),record))

    def test_paths_are_confined_to_official_repo(self):
        commit='a'*40
        self.assertIn('A%5Bwght%5D.ttf',source_url(commit,'ofl/family/A[wght].ttf'))
        for bad in ('../../evil','ofl/../evil','https://other/font.ttf','other/a.ttf','ofl/a\\b.ttf'):
            with self.assertRaises(ValueError):source_url(commit,bad)
        with self.assertRaises(ValueError):source_url('untrusted','ofl/a.ttf')
        self.assertIn('/notofonts/noto-fonts/',source_url(commit,'archive/unhinted/a.ttf','notofonts/noto-fonts'))
        self.assertIn('/notofonts/noto-cjk/',source_url(commit,'Sans/OTC/a.ttc','notofonts/noto-cjk'))
        with self.assertRaises(ValueError):source_url(commit,'Sans/a.ttf','other/repo')
        with self.assertRaises(ValueError):source_url(commit,'other/a.ttf','notofonts/noto-cjk')

if __name__ == '__main__':
    unittest.main()
