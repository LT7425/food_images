# upload local images to github 

1. git clone project to local and run `npm install` to install dependencies
2. create a `.env` file and add your github token to it
3. run `node upload_images.js` to upload images to github
4. the images will be uploaded to `https://github.com/your_username/your_repo/tree/main/images`
5. the images will be uploaded to `https://raw.githubusercontent.com/your_username/your_repo/main/images`
6. the images will be uploaded to `https://cdn.jsdelivr.net/gh/your_username/your_repo@main/images`
