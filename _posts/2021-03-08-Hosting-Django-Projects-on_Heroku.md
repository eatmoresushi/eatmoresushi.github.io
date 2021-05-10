---
title: Hosting Django projects on Heroku
date: 2021-03-08 Z
layout: post
---
[FilmFinder](https://github.com/eatmoresushi/FilmFinder) was the capstone project at UNSW. I developed it with three other people, but except the movie recommendation feature, I have coded or edited all the other features. While learning [Django](https://www.djangoproject.com) from scratch.

I intend to present it somewhere, so that I could show it to my future employers. I come across [Heroku](https://dashboard.heroku.com) and it seems great. It has a free tier and the deploy process looks like it is rather easy.

Well it turns out some of the documentations on how to deploy it are out dated. I followed [Configuring Django Apps for Heroku](https://devcenter.heroku.com/articles/django-app-configuration) and it was very confusing. It asks me to create a *Procfile*  with the following content: `web: gunicorn myproject.wsgi` and install *Gunicorn* via *Pip.* OK, but what is `myproject.wsgi` ? Do I need to create it? Where do I get the name *myproject*? I had to do few more researches and find there is a line in the `settings.py` of my project like this:

`WSGI_APPLICATION = 'FilmFinder.wsgi.application'`

So I should replace `myproject` with `FilmFinder` . Next step is using `django-heroku` package, unfortunately, the [repository](https://github.com/heroku/django-heroku) of this package on Github is archived. When I tried to install it, it returns lots of errors and the installation is unsuccessful. There is no information on what to do on Heroku's documentations nor the Github repository. I'm again, on my own. After some more researches, I found that somebody forked the previous repository and renamed it to `django-on-heroku` . Installed it and finally the project is on Heroku.

However, the database is empty. Because Heroku does not use SQLite as we used in our project (Django default). I found the following instruction from this [link](https://realpython.com/migrating-your-django-project-to-heroku/):

We need to transfer the data from the local database to the production database. Install the Heroku PGBackups add-on:

`$ heroku addons:add pgbackups`

However, it is outdated again because PG Backups as an add-on has been deprecated. Fortunately, the functions seems point to [PG Backups commands](https://devcenter.heroku.com/articles/heroku-postgres-backups) and I found the following restore command:

`$ heroku pg:backups:restore '`[`https://s3.amazonaws.com/me/items/mydb.dump`](https://s3.amazonaws.com/me/items/mydb.dump)`' DATABASE_URL -a sushi`

Ok, so if we can dump our database then upload it on a publicly accessible URL we are golden? How do we dump the database? The following steps look promising:

[Migrate Django development database (.sql3) to Heroku](https://stackoverflow.com/questions/28648695/migrate-django-development-database-sql3-to-heroku/28662117#28662117)

I followed the above steps however I’m stuck at step 6 with fixture issues. Maybe I should start at the empty PostgreSQL and insert data in? Then start at step 7. After restoring the database dump I finally got it working on [https://filmfinder.herokuapp.com](https://filmfinder.herokuapp.com).

