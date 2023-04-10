sudo docker build --tag chinook_example_image .
sudo docker run -d -p 3306:3306 --name chinook-example-db chinook_example_image:latest