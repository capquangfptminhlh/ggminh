import hashlib
import io
import sys
import unittest
import zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from font_origin_iosevka import verify_entries

class IosevkaVerificationTest(unittest.TestCase):
    def archive(self, entries):
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as z:
            for name,data in entries:z.writestr(name,data)
        buf.seek(0)
        return zipfile.ZipFile(buf)
    def test_exact_binary_and_missing(self):
        row={'candidate_path':'fonts/a.ttf','archive_basename':'a.ttf','sha256':hashlib.sha256(b'good').hexdigest()}
        with self.archive([('folder/a.ttf',b'good')]) as z:self.assertEqual(verify_entries(z,[row])[0]['result'],'PASS')
        with self.archive([('folder/a.ttf',b'bad')]) as z:self.assertEqual(verify_entries(z,[row])[0]['result'],'FAIL')
        with self.archive([]) as z:self.assertEqual(verify_entries(z,[row])[0]['result'],'FAIL')
    def test_ambiguous_basename_fails(self):
        row={'candidate_path':'fonts/a.ttf','archive_basename':'a.ttf','sha256':hashlib.sha256(b'good').hexdigest()}
        with self.archive([('a/a.ttf',b'good'),('b/a.ttf',b'good')]) as z:self.assertEqual(verify_entries(z,[row])[0]['result'],'FAIL')

if __name__ == '__main__':unittest.main()
