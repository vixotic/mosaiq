# OCI Object Storage

Mosaiq can keep originals and thumbnails in a private Oracle Cloud Infrastructure Object Storage
bucket. The browser never receives Oracle credentials or direct bucket access; image requests still
pass through the Mosaiq API.

## Recommended bucket settings

Create the bucket in the same region as the Mosaiq VM:

- Name: `mosaiq-images`
- Default storage tier: Standard
- Public access: disabled
- Object versioning: disabled initially
- Auto-tiering: disabled
- Encryption: Oracle-managed keys
- Emit object events: disabled

Do not add a public access rule, pre-authenticated request, CORS rule, or lifecycle deletion rule.

## Give only the Mosaiq VM access

Create a dynamic group named `mosaiq-instance` with a rule matching the VM itself:

```text
instance.id = '<MOSAIQ_INSTANCE_OCID>'
```

Then create a tenancy policy named `mosaiq-object-storage` with these statements when the bucket is
in the root compartment:

```text
Allow dynamic-group mosaiq-instance to use buckets in tenancy where target.bucket.name='mosaiq-images'
Allow dynamic-group mosaiq-instance to manage objects in tenancy where target.bucket.name='mosaiq-images'
```

If the bucket is in a child compartment, replace `in tenancy` with
`in compartment <COMPARTMENT_NAME>`. This policy allows the selected VM to inspect the bucket and
read, create, and delete its objects; it does not grant permission to make the bucket public or
delete the bucket.

## Application configuration on the VM

```env
STORAGE_DRIVER=oci
OCI_AUTH_MODE=instance_principal
OCI_OBJECT_STORAGE_NAMESPACE=<namespace shown on the bucket details page>
OCI_OBJECT_STORAGE_BUCKET=mosaiq-images
OCI_OBJECT_STORAGE_REGION=ap-hyderabad-1
OCI_OBJECT_STORAGE_PREFIX=mosaiq
```

No Oracle API key is stored in `.env`. The SDK obtains short-lived credentials from the VM through
its instance principal.

## Move an existing local library

Keep `STORAGE_ROOT` pointed at the existing local storage directory and set the OCI variables above.
Before switching the running application to OCI storage, run:

```bash
pnpm storage:migrate-to-oci
```

The command copies missing originals and thumbnails, skips objects already present, and stops if a
database-referenced local file is missing. It does not delete the local copy. After it completes,
set `STORAGE_DRIVER=oci`, restart Mosaiq, and verify several originals and thumbnails before removing
any old server-side files.

For migration from a non-OCI computer, set `OCI_AUTH_MODE=config_file` and provide
`OCI_CONFIG_FILE`/`OCI_CONFIG_PROFILE`. Instance-principal migration from the deployed VM is the
preferred path because it avoids long-lived user API credentials.

## Recovery

Object Storage protects the image binaries, but PostgreSQL still contains the titles, notes, tags,
collections, and the mapping between database records and object keys. Back up the database as a
separate scheduled task. A usable Mosaiq recovery requires both the bucket objects and a compatible
PostgreSQL backup.
