-- Session 47: Prevent duplicate posts rows per client/post ID.
--
-- Preview run before creating this migration:
-- SELECT post_id, client_id, COUNT(*)
-- FROM posts
-- GROUP BY post_id, client_id
-- HAVING COUNT(*) > 1;
--
-- Result on 2026-06-17: 0 rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'posts'::regclass
      AND contype = 'u'
      AND (
        SELECT array_agg(att.attname ORDER BY att.attname)
        FROM unnest(conkey) AS key(attnum)
        JOIN pg_attribute att
          ON att.attrelid = conrelid
         AND att.attnum = key.attnum
      ) = ARRAY['client_id', 'post_id']
  ) THEN
    ALTER TABLE posts
      ADD CONSTRAINT posts_post_id_client_id_unique UNIQUE (post_id, client_id);
  END IF;
END $$;
