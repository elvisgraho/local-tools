# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install FFmpeg and Poppler (for pdf2image)
RUN apt-get update && apt-get install -y ffmpeg poppler-utils --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Install any needed dependencies specified in requirements.txt
# The requirements.txt file is copied by the 'COPY . /app' command earlier
RUN pip install --no-cache-dir -r requirements.txt

# Expose the port the app runs on
EXPOSE 5000

# Define environment variable
ENV FLASK_APP=backend/app.py
ENV FLASK_RUN_HOST=0.0.0.0

# Run the application
CMD ["flask", "run"]