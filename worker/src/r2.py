import os, boto3, tempfile
from botocore.config import Config

# R2_ENDPOINT lets you point at any S3-compatible store (MinIO / LocalStack) without a code
# change; unset -> the account's Cloudflare R2 endpoint.
_endpoint = os.environ.get("R2_ENDPOINT") or (
    f"https://{os.environ.get('R2_ACCOUNT_ID', 'unset')}.r2.cloudflarestorage.com"
)
_s3 = boto3.client(
    "s3", region_name="auto",
    endpoint_url=_endpoint,
    aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID"),
    aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY"),
    config=Config(s3={"addressing_style": "path"} if os.environ.get("R2_ENDPOINT") else {}),
)
BUCKET = os.environ.get("R2_BUCKET_NAME", "gvmc-data")

def download(key: str) -> str:
    fd, path = tempfile.mkstemp(suffix="_" + key.split("/")[-1])
    os.close(fd)
    _s3.download_file(BUCKET, key, path)
    return path

def upload(path: str, key: str, content_type: str = "application/octet-stream") -> str:
    _s3.upload_file(path, BUCKET, key, ExtraArgs={"ContentType": content_type})
    return key
