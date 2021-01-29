---
title: Publish Bear notes to Github Pages
date: 2021-01-29 Z
layout: post
---
I have been using [Bear](https://bear.app) app to note down everything for the last year. Naturally, I tried to write my blogs hosted on [GitHub Pages](https://pages.github.com) using it. I thought it would be pretty easy to publish those blogs because both Bear and Github pages support Markdown.

However, I ran into few problems. The biggest one is about pictures. To insert pictures in a Markdown file. We use syntax like the following:
`![IMAGE_DESCRIPTION](IMAGEFILE_PATH)`
After exporting my notes into Markdown files from Bear, all the pictures became something like the syntax above. However, the paths of the image files is not useful. They only include the title of the note that picture belongs and the name of the picture file:
![]({{site.url}}/assets/95457200-EEA9-4477-9986-1217C4C7CC1D-1588-000087C1F14D9A6B/Screen Shot 2021-01-29 at 9.02.07 pm.png)
The references for the pictures worked inside the bear app but they do not work anymore after exporting. In order to make correct references, we first need to find out where does Bear stores all its files. I did some research online and found this [comment](https://www.reddit.com/r/bearapp/comments/dhnj6l/programmatically_export_bear_notes/f3p43bf?utm_source=share&utm_medium=web2x&context=3) on Reddit. Apparently the MAC version of Bear stores everything in the following directory:
`~/Library/Group Containers/9K33E3U3T4.net.shinyfrog.bear/Application Data/`
In this directory, there is a folder called `Note Images` and it seems very promising. However, there are folders inside it with names like `05A1C3A3-B1C0-43BA-A92C-6347FC30CCDF-1588-00007C77B4E641F6` as shown below:
![]({{site.url}}/assets/E6D41FD0-4799-4243-A057-8E34755C78FA-1588-000086B95684BE0B/Screen Shot 2021-01-29 at 8.43.11 pm.png)
This reminds me of the unique identifiers for each note in Bear. Is that means the pictures of each note stored together in a folder named using the note’s identifier? But using one of such identifiers to search returned no results. The names are not the unique identifiers for the notes. What would it be? 

I decided to dig deeper by looking at its database file named `database.sqlite`. Obviously it is a sqlite database. After opening it I found there is a table called `ZSFNOTE`, checking the attributes I found one called `ZTEXT` and another one called `ZUNIQUEIDENTIFIER`. `ZTEXT` contains all the contents of the notes and they can be identified by the values of `ZUNIQUEIDENTIFIER` attribute. A `ZTEXT` value of the same note mentioned earlier containing pictures looks like below:
![]({{site.url}}/assets/16E5844C-06F5-494C-8C61-98493E4F5DC5-1588-000087568B8458E1/Screen Shot 2021-01-29 at 8.54.27 pm.png)
Turns out each image has its own identifier and use it as the folder name. Now I just need to replace the paths with the format Github Pages recognise. The static website generator behind Github Pages is [Jekyll](https://jekyllrb.com). Jekyll uses Liquid templating language for the paths. I liked the way of using different folder for different pictures and I just need to copy the same folders into my `assets` folder which is where I store pictures.

Another issue is the metadata for each blog post. Jekyll uses a [YAML](https://yaml.org) front matter block like the following:
```
---
layout: post
title: Blogging Like a Hacker
---
```
In my situation, I have a layout named `post` already setup in my `_layout` directory and I want to set each post’s layout as `post`. I can do that by using this front matter. Hence, I have to add this on my blogs written by Bear.

It would be helpful if I could automate the process of uploading the Markdown files to Github using Git. And rename the name of file into the Jekyll specific formats.

Fortunately, all the above things could be done by Python. I wrote a Python script [here](https://raw.githubusercontent.com/eatmoresushi/eatmoresushi.github.io/master/bear2blog.py) and I used it to upload this blog.   
                 