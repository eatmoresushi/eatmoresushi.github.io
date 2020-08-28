---
title: Performance tests on Android phones
date: 2017-05-04 00:00:00 Z
layout: post
---
This blog records the process of making an automatic performance test platform for Lenovo's new mobile phones.
## Goal
Lenovo mobile makes a lot of new phones each year. All these phones are running Android OS. Our team is in charge of the performance of the final product. We want to make sure that each new phone goes to the market meets our exceptions. How to measure the performance was the first question we had to answer. We decide to use multiple third-party benchmark apps as discussed below. Then we compares the scores from each build to reflex the impacts of the changes.
## Evaluation measurements
The main evaluations are scores from benchmark applications, iozone test, launch latency and memory test. The specific applications or code used for each category are: 
### Benchmark applications
Here we run the apps in the following list multiple times. Calculate and record their average scores. The list contains Antutu-benchmark-3d, Antutu-benchmark-v530, Antutu-benchmark-v560, Antutu-benchmark-v600, Antutu-benchmark-v621, Antutu-benchmark-v633, 3Dmark_v1, A1_SD-Bench, Androbench4.0, Basemark_GUI_free, Linpack, Ludashi, Futuremark, Membench, NenaMark, Passmark, ThermalDryv3.
### IOzone test
[IOzone](http://www.iozone.org/) is a filesystem benchmark tool. It can be used for Android using a tutorial like this [one](http://jhshi.me/2014/12/31/benchmarking-android-file-system-using-iozone/index.html). 
### Launch latency
Here we launch a list of pre-selected, common apps and record their launch speed. The apps we use are Weibo, QQ, Empty, TempleRun2, UC browser and WeChat.
### Memory test
Here we use `adb shell cat /proc/meminfo` to get memory information including total memory, total free memory, available memory, buffers and cached.
## Methods and process
All the ADB interactions with the phone and tap simulations are done through [AndroidViewClient](https://github.com/dtmilano/AndroidViewClient). Our automatic application will first download the lasted OS ROM build from internal site, install it on our test phone. Then run all the evaluation measurement modules, record the results and covert them into one PDF file. Finally, the PDF file get uploaded to our daily report site. 
