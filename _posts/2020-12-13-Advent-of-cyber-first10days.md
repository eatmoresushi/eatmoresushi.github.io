---
title: Advent of Cyber 2 first 10 days
date: 2020-12-13 00:00:00 Z
layout: post
---
[Advent of Cyber 2020](https://tryhackme.com/room/adventofcyber2) is an Cyber Security event hosted on tryhackme.com. It has a new exercise each day from the first day of December leading up until Christmas. It is very beginner friendly and lots of basic tools are introduced during the exercises. It has been very helpful to increase the size of my toolkit.
Most of the contents covered in the exercises from the first 10 days are relatedly easy. However, I did learn something new:
### Getting a Reverse Shell From Remote Command Execution
From the exercises of day2, there is an example of getting a reverse shell from remote command execution including the following steps:
1. Find a file upload point 
2. Try uploading some innocent files -- what does it accept? (Images, text files, PDFs, etc) 
The victim website allows users to upload image files. 
3. Find the directory containing your uploads.  
4. Try to bypass any filters and upload a reverse shell.
The website only has an easy extension filters that split the filename at the dot and check what comes after it against an image file list. Thus I could upload a file ends with `.jpg.php`. Kali has a php shell script can be used at `/usr/share/webshells/php/php-reverse-shell.php`. Two lines have to be changed in this script, the first is the ip and the second is the port number. Ip is the ip address of the machine I'm using, can be found by `ip a show tun0`. 
5. Start a netcat listener to receive the shell
`sudo nc -lvnp 443`, where 443 is the port number used.
6. Navigate to the shell in your browser and receive a connection!

### Introduction to Gobuster
Gobuster is a brute forcing tool to check if common paths (provided by a dictionary file) exist in the URL. It is included in the Kali and it has three modes: `dir`,`vhost` and `dns`.
`dir` is most used and a common use is like this:
`gobuster dir -u http://example.com -w wordlist.txt -x php,txt,html`
Where wordlist.txt is the provided dictionary file and `-x` command can be used to specify file types. Wordlists such as [SecLists](https://github.com/danielmiessler/SecLists) have wordlists for specific applications and platforms.
### Introduction to wfuzz
wfuzz is another brute forcing fuzz tool similar to Gobuster. wfuzz can use the word `FUZZ` in place of the parameter we want to brute force. An example is show below:
`wfuzz -w date_wordlist.txt http://10.10.6.131/api/site-log.php\?date=FUZZ`
Here we want to find out valid dates for this URL. What wfuzz is doing is replace the `FUZZ` with each value from my `date_wordlist`.
### Use SQLMap Together With BurpSuite
I previously used SQLMap which is an automate SQL injection tool. Here is an easy example:
`sqlmap --url http://example.com/login.php`
From the exercises of day5, I learnt that requests intercepted by BurpSuite be used directly with SQLMap. In the BurpSuite interface we can save the request by click `Save item`, then use SQLMap like the following:
`sqlmap -r filename`
### Introduction to OWASP Zap
ZAP is a web application scanner used to detect XSS (Cross-site scripting) vulnerabilities. It is included in Kali and has a nice GUI which is easy to use.
### Introduction to Enum4linux
Samba system is a file sharing system consists of two protocols: SMB (for Windows) and NFS (for Linux). Enum4linux is a tool to scan such systems. Following is an example command:
`enum4linux -S 10.10.82.110`
smbclient can be used to connect the Samba system.
