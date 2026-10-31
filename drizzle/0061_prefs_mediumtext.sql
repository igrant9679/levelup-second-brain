-- prefs was the only `text` column in user_app_data (64 KB). Preferences grew past
-- that (assistant history, coach memory + trash, briefings, saved reports), and
-- every save of them failed: "Sync to server failed ... update user_app_data set prefs".
-- MEDIUMTEXT (16 MB) like every other list in the table. Widening keeps all data.
ALTER TABLE `user_app_data` MODIFY `prefs` mediumtext;
