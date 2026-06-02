----- READ THIS -----

To stream with tournament graphics, a Music Heads Up, Countdown Timer, Slideshow, and more. Follow this tutorial. (A guide by Kishark. www.youtube.com/@kishark for the channel www.youtube.com/@megamanarena). 

***StreamArena is built independent and is a great streameing tool. It was designed to work well with Tournament Streamer Helper. It does not reference or require it or have anything to do with it. With that said, this guide explains how to go about using TSH with Mega Man Arena and how to use StreamArena and TSH to run MMA Tourney Streams.

You'll need to have the following installed:

node.js -- https://nodejs.org/en

Snip -- https://github.com/dlrudie/Snip/releases

Tournament Streamer Helper (TSH) -- https://github.com/joaorb64/TournamentStreamHelper/releases

Drive with resources Needed: https://drive.google.com/drive/folders/1nR2IxXB31gZ0JK9Lw0gq_MkeoywtOJAw?usp=sharing

- Custom Mega Man Arena TSH Profile
- StreamArena

Important Things to Remember before beginning.
Once you extract and setup all of the above files, here are some important things to know.
TSH runs separately from StreamArena, StreamArena is simply a server run on your computer directly on one of your own ports to run html code so Streamlabs can display information you can modify.
TSH does not have Mega Man Arena art or graphics natively, which is why you must extract the mma.zip and put it in the games (profiles) folder in the TSH directory. Here is the file URL "C:\Users\[username]\TSH\TournamentStreamHelper-5.970\user_data\games".
The Snip application updates a txt file every time the song changes that is being played in Spotify. The txt file goes into the Snip directory under the name snip.txt. StreamArena outputs a similar txt file called current_spotify_song.txt, pulling the information from snip.txt and modifying it, which allows you to use a modified version (explained later).

Step-by-step Guide to using all of this crazy to make a beautiful, dynamic, useful MMA Stream:
Download node.js by following the link (https://nodejs.org/en). This is how we'll be running a local server on our computer. Download the Windows Installer. Open PowerShell or type CMD into windows to open command prompt and type "node --version", this will make sure you installed node correctly. Version at the time of making this for me is (v24.15.0).
Open and download Snip. This is what checks which Spotify song is playing. You need to have the desktop app of Spotify installed and it will ask you to log in each time you open snip.exe or the shortcut. It then takes the song title and artists and puts it into a txt file in the snip directory.
For this to work properly you'll need to link the MelodyManRemixes folder to Spotify. You can look this up on Google pretty easily, but in settings you can add local music files and Spotify will act like they are full tracks and you can add them to playlists.
With Snip (and the updating txt file that has title and artist information) you'll be able to add that data to html overlays or directly input the text into Streamlabs with the "read from file" option. If you set it to the Snip.txt it will output the raw Spotify name and artist. However, some files don't have the artist set or the title is improper. StreamArena takes your snip.txt path directory and puts it through a filter (a filter you can modify in music settings in StreamArena). In Music Settings in StreamArena, you can make an override for songs that have a title or artist you wish to change. Do this by copying the Snip.txt results of the song you wish to modify (raw snip.txt results) and putting what you actually want to display. You can also use this new txt file called current_spotify_song.txt in Streamlabs directly if you make a text object and set to use local file. This will allow you to make scrolling text if you set the text object up correctly.

3. Open the StreamArena.exe file to start running a local server that only people on your Wi-Fi with access to your port can connect to. This server is accessible to the right of the task bar in the tray in the bottom right and can be right clicked to close or clicked it to open the controls which run out of your browser through html. StreamArena loads the server which handles the Music Overlay and any other widgets you wish to use. The controls menu which opens by default has an entire how-to guide on how to use the interface and how each widget works, I highly recommend reading through that and making sure all your directories are correct (such as correctly linking the snip.txt to the server interface).

4. Using StreamArena is simple, especially after reading the how-to guide, but here are some additional things to know. StreamArena uses html to make overlays in Streamlabs that update every few seconds. Making things like adaptable countdown timers convenient as you don't have to jerry rig a countdown app and screen record it. On top of that, you can modify things on the fly.
To use the overlays provided by the server running on your computer through StreamArena, copy the URL given in the widgets menu or preview menu, and put the URL into a browser source in Streamlabs. Be sure to modify the aspect ratio to exactly how you want it for each overlay. I recommend turning on "refresh when source becomes active" as this will make sure it's connected to StreamArena when you switch scenes and a source becomes active.

5. Open TSH (Tournament Streamer Helper) as this runs the entirety of tournament overlays.
This one is pretty self-explanatory. With some poking around it's pretty straight forward and there are YouTube videos explaining how each function works. This application allows you to pull straight from start.gg, pulling account information, allowing for scoreboard HUDs at the top of your tournament match, and more. Be sure to poke around the layout folder which has all of the pre-built overlays needed (C:\Users\[username]\Desktop\TSH\TournamentStreamHelper-5.970\layout).
To add one of these overlays to Streamlabs, create a browser source and set it up how you want and instead of using a local web address like with StreamArena you use local file and link the HTML file URL of the overlay you want to use. Most are named index.html (many have images giving a preview of what each overlay looks like, but I learned by chucking them into Streamlabs and seeing for myself!)


Any questions? Who on earth knows how to contact me. Let's be honest, if someone is ACTUALLY following this I probably died or something horrible cause y'all would've wanted me to handle this lol. However, I make this because I hope others can understand it because it's scuffed but cool beans. StreamArena was made with the help of AI, but all the features you see are my ideas and constant micro adjustments were made to get the product you see. Constant errors came up, some were fixed by AI and some I fixed. This whole project has taken me countless hours and using AI to help doesn't take away from the hard work I've put in for days straight... oops. If you hate that I used AI to help me with server code and html (which I know nothing about) then don't use this :D, otherwise have fun cause it's cool.
