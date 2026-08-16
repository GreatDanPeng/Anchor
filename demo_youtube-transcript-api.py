from youtube_transcript_api import YouTubeTranscriptApi
video_id = "X2gR4po_yBs"
# video web path = "https://www.youtube.com/watch?v=X2gR4po_yBs&list=PLTyfDsD2vBgOEAi4vkiYq1RXZPm2PIEeA&index=6"
ytt_api = YouTubeTranscriptApi()
fetched_transcript = ytt_api.fetch(video_id)

# is iterable
for snippet in fetched_transcript:
    print(snippet.text)

# indexable
last_snippet = fetched_transcript[-1]

# provides a length
snippet_count = len(fetched_transcript)