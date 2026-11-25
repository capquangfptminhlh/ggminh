import io, pathlib, sys, tempfile, unittest, zipfile
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'tools'))
from ci_clean508_zip import reconstruct
class ZipTest(unittest.TestCase):
 def test_roundtrip_and_path_rejection(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t)/'engine';root.mkdir();(root/'a.txt').write_bytes(b'hello')
   rows=[{'path':'a.txt','date_time':[2020,1,2,0,0,0],'external_attr':2176188416}]
   output=pathlib.Path(t)/'out.zip';reconstruct(root,output,rows)
   with zipfile.ZipFile(output) as z:self.assertEqual(z.read('a.txt'),b'hello')
   with self.assertRaises(ValueError):reconstruct(root,pathlib.Path(t)/'bad.zip',[{**rows[0],'path':'../outside'}])
   with self.assertRaises(ValueError):reconstruct(root,pathlib.Path(t)/'dup.zip',rows+rows)
if __name__=='__main__':unittest.main()
