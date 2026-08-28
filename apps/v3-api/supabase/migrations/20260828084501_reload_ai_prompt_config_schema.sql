-- Long-running PostgREST instances must refresh table capabilities after this migration.
notify pgrst, 'reload schema';
