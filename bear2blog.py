import sqlite3
from sqlite3 import Error as dbError
import os
import sys
import datetime
from shutil import copy2
import subprocess

# bear_db_path = os.path.expanduser('~/Library/Group Containers/9K33E3U3T4.net.shinyfrog.bear/Application Data/database.sqlite')

bear_img_path = os.path.expanduser('~/Library/Group Containers/9K33E3U3T4.net.shinyfrog.bear/Application Data/Local Files/Note Images')

local_path = os.path.expanduser('~/Projects/eatmoresushi.github.io')

local_img_path = os.path.expanduser('~/Projects/eatmoresushi.github.io/assets')

local_file_path = os.path.expanduser('~/Projects/eatmoresushi.github.io/_posts')

site_img_path = '{{site.url}}'



def conn2db (bear_db_path, note_id):
	conn = None
	try:
		conn = sqlite3.connect(bear_db_path)
	except dbError as e:
		print(e)
		exit()
	cur = conn.cursor()
	cur.execute("SELECT ZHASFILES, ZHASIMAGES, ZTITLE, ZTEXT FROM ZSFNOTE WHERE ZUNIQUEIDENTIFIER =?", (note_id,))
	results = cur.fetchone()
	conn.close()
	return results

def edit_md (has_file, has_img, title, text):
	# remove tags and the title
	text_list = text.split("\n")[2:]
	if has_file == 1:
		# currently do not care about attached files
		pass
	if has_img == 1:
		for i, s in enumerate(text_list):
			if s.startswith('[image:'):
				img_folder = s[7:65]
				img_name = s[s.index('/') + 1:-1]
				if not os.path.exists(f'{local_img_path}/{img_folder}'):
					local_img_dir = os.makedirs(f'{local_img_path}/{img_folder}')
				# put images to local image path
				copy2(f'{bear_img_path}/{img_folder}/{img_name}', f'{local_img_path}/{img_folder}')
				text_list[i] = f'![]({site_img_path}/assets/{img_folder}/{img_name})'
	text = '\n'.join(text_list)
	
	metadata = f"""---
title: {title}
date: {datetime.date.today()} Z
layout: post
---
"""
	return metadata + text
	

def finalize (text):
	new_file_name = f"{datetime.date.today()}-{title.replace(' ', '-')}.md"
	with open(f'{local_file_path}/{new_file_name}', 'w') as f:
		f.write(text)

	# git stuff
	subprocess.run(['git','pull'])
	subprocess.run(['git','add','-A'])
	subprocess.run(['git','commit','-m',f'add note {new_file_name}'])
	subprocess.run(['git','push'])

if __name__ =='__main__':
	if len(sys.argv) == 2:
		note_id = sys.argv[1]
		results = conn2db(os.path.expanduser('~/Library/Group Containers/9K33E3U3T4.net.shinyfrog.bear/Application Data/database.sqlite'), note_id)
		has_file, has_img, title, text = results
		final_md = edit_md(has_file, has_img, title, text)
		finalize(final_md)
		
	else:
		print("usage: python3 bear2blog.py [note identifier]")