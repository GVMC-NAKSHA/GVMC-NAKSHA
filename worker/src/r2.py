import os, boto3, tempfile
_s3 = boto3.client(
    "s3", region_name="auto",
    endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
)
BUCKET = os.environ["R2_BUCKET_NAME"]

def download(key: str) -> str:
    fd, path = tempfile.mkstemp(suffix="_" + key.split("/")[-1])
    os.close(fd)
    _s3.download_file(BUCKET, key, path)
    return path
