---
title: Setting up Pi-hole
date: 2020-10-20 00:00:00 Z
layout: post
---
So I got a Raspberry Pi from Amazon prime day deals. The first thing I came up using it is setting up the Pi-hole. Pi-hole is an internet ad blocker running as a DHCP server. 

Install Pi-hole on Raspberry Pi OS is pretty simple, just follow the steps on its [GitHub page](https://github.com/pi-hole/pi-hole). One step is that I need to choose run it on `wlan0` or `eth0` interface, `wlan0` is used if the Raspberry Pi connected to the network via WiFi and `eth0` is used if it is connected via Ethernet cable. After installation, I have to set it up on the router because I want to make it for all the devices connected to the WIFI-network. There is a guide [here](https://discourse.pi-hole.net/t/how-do-i-configure-my-devices-to-use-pi-hole-as-their-dns-server/245), however, my router does not have the settings listed in the guide. I ended up disable my router’s DHCP server in the LAN setting and enable the DHCP server provided by Pi-hole. It can be configured in the settings-DHCP of the web interface.

Another thing I did was add more blocklists besides the default two. I added more from this website: [List Generator ¦ Firebog](https://v.firebog.net/hosts/lists.php). I also disabled the logging function by running `pihole -l off` on the Raspberry Pi.

It works out great. It blocks all the ads on [eXtreme test on can you block it](https://canyoublockit.com/extreme-test/). One problem though, how do I use it while I was not home? Because it sits on my home router. If I study at school, I have to go back to the browser extension based ad-blockers. I read that I can set up a VPN and access Pi-hole while I’m not at home via the VPN. If I have time I will try to set up it.  