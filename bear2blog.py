import sqlite3
import os
import datetime
from shutil import copy2
import subprocess

bear_db_path = os.path.expanduser('~/Library/Group Containers/9K33E3U3T4.net.shinyfrog.bear/Application Data/database.sqlite')

bear_img_path = os.path.expanduser('~/Library/Group Containers/9K33E3U3T4.net.shinyfrog.bear/Application Data/Local Files/Note Images')

test_note_id = '641B9387-00AB-45EC-83AD-5306D159C817-1588-00007C66887643CC'

local_path = os.path.expanduser('~/Projects/eatmoresushi.github.io')

local_img_path = os.path.expanduser('~/Projects/eatmoresushi.github.io/assets')

local_file_path = os.path.expanduser('~/Projects/eatmoresushi.github.io/_posts')

site_img_path = '{{site.url}}'

conn = sqlite3.connect(bear_db_path)
cur = conn.cursor()
cur.execute("SELECT ZHASFILES, ZHASIMAGES, ZTITLE, ZTEXT FROM ZSFNOTE WHERE ZUNIQUEIDENTIFIER =?", (test_note_id,))

# remove tags and the title
has_file, has_img, title, text = cur.fetchone()
conn.close()

text_list = text.split("\n")[2:]

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

# add metadata
metadata = f"""---
title: {title}
date: {datetime.date.today()} Z
layout: post
---
"""
if has_file == 1:
	# currently do not care about attached files
	pass

new_file_name = f"{datetime.date.today()}-{title.replace(' ', '-')}.md"
with open(f'{local_file_path}/{new_file_name}', 'w') as f:
	f.write(metadata + text)

# git stuff
subprocess.run(['git','pull'])
subprocess.run(['git','add','-A'])
subprocess.run(['git','commit','-m',f'add note {new_file_name}'])
subprocess.run(['git','push'])

if __name__ =='__main__':
	if len(sys.argv) == 2:
		note_id = sys.argv[1]
		print(note_id)
	else:
		print("usage: python3 bear2blog.py [note identifier]")